"""HORIZON world model: LSTM encoder + attention pool + MDN dynamics head + BCE readout.

Spec: technical.md 2. The Kaggle notebook trains an instance of HorizonModel and
saves its state_dict to artifacts/model.pt together with the hyperparameters used
to build it. This module is the single source of the architecture - the notebook
imports it, so training and inference cannot drift.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import torch
import torch.nn.functional as F
from torch import nn

from . import N_FEATURES, N_INPUT


@dataclass
class ModelConfig:
    n_input: int = N_INPUT        # 11 (10 features + intervention)
    n_features: int = N_FEATURES  # 10 predicted
    hidden: int = 128
    layers: int = 2
    dropout: float = 0.2
    k_mix: int = 5
    logvar_min: float = -3.0  # was -7; -7 let variances collapse to the floor -> exploded per-feature NLL
    logvar_max: float = 3.0


class AttentionPool(nn.Module):
    """Additive attention over the 20 history LSTM outputs (explainability part a)."""

    def __init__(self, hidden: int):
        super().__init__()
        self.w = nn.Linear(hidden, hidden)
        self.v = nn.Linear(hidden, 1, bias=False)

    def forward(self, outputs: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        # outputs: (B, T, H)
        scores = self.v(torch.tanh(self.w(outputs))).squeeze(-1)  # (B, T)
        weights = F.softmax(scores, dim=-1)                       # (B, T)
        context = torch.bmm(weights.unsqueeze(1), outputs).squeeze(1)  # (B, H)
        return context, weights


class MDNHead(nn.Module):
    """Mixture density network over the next state (K_mix diagonal Gaussians)."""

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.cfg = cfg
        self.k = cfg.k_mix
        self.d = cfg.n_features
        self.fc = nn.Linear(cfg.hidden, self.k * (1 + 2 * self.d))

    def forward(self, state: torch.Tensor):
        out = self.fc(state)
        logits = out[:, : self.k]
        means = out[:, self.k : self.k + self.k * self.d].view(-1, self.k, self.d)
        log_vars = out[:, self.k + self.k * self.d :].view(-1, self.k, self.d)
        log_vars = log_vars.clamp(self.cfg.logvar_min, self.cfg.logvar_max)
        return logits, means, log_vars

    def nll(self, state: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """Mean mixture negative log-likelihood. target: (B, d)."""
        logits, means, log_vars = self(state)
        log_pi = F.log_softmax(logits, dim=-1)                       # (B, K)
        t = target.unsqueeze(1)                                      # (B, 1, d)
        log_prob = -0.5 * (((t - means) ** 2) / log_vars.exp() + log_vars + math.log(2 * math.pi))
        log_prob = log_prob.sum(-1)                                  # (B, K)
        return -torch.logsumexp(log_pi + log_prob, dim=-1).mean()

    def per_feature_nll(self, state: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """Per-dimension NLL of target under the most-likely component (explainability part c).

        Returns (B, d). Uses the argmax mixture component so each feature's
        surprise is read off one Gaussian, not a mixture marginal.
        """
        logits, means, log_vars = self(state)
        k = logits.argmax(dim=-1)                                    # (B,)
        idx = k[:, None, None].expand(-1, 1, self.d)
        mu = means.gather(1, idx).squeeze(1)                         # (B, d)
        lv = log_vars.gather(1, idx).squeeze(1)
        return 0.5 * (((target - mu) ** 2) / lv.exp() + lv + math.log(2 * math.pi))

    def sample(self, state: torch.Tensor, generator: torch.Generator | None = None) -> torch.Tensor:
        logits, means, log_vars = self(state)
        probs = F.softmax(logits, dim=-1)
        k = torch.multinomial(probs, 1, generator=generator).squeeze(-1)  # (B,)
        idx = k[:, None, None].expand(-1, 1, self.d)
        mu = means.gather(1, idx).squeeze(1)
        sigma = log_vars.gather(1, idx).squeeze(1).mul(0.5).exp()
        eps = torch.randn(mu.shape, generator=generator, device=mu.device)
        return mu + sigma * eps


class ReadoutHead(nn.Module):
    """P(attack window within the next K) - BCE readout (technical.md 2.3)."""

    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(cfg.hidden, 64),
            nn.ReLU(),
            nn.Dropout(cfg.dropout),
            nn.Linear(64, 1),
        )

    def forward(self, state: torch.Tensor) -> torch.Tensor:
        return self.net(state).squeeze(-1)  # logit

    def prob(self, state: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self(state))


class HorizonModel(nn.Module):
    """Full model. `encode` consumes 20 history windows; `step` advances one window.

    The heads consume a *state* vector built from the current LSTM output and the
    attention context over history: state = tanh(W [lstm_out ; context]). Context
    is computed once from history and reused every rollout step, so attention sits
    in the prediction path rather than being a detached side output.
    """

    def __init__(self, cfg: ModelConfig | None = None):
        super().__init__()
        self.cfg = cfg or ModelConfig()
        self.lstm = nn.LSTM(
            self.cfg.n_input,
            self.cfg.hidden,
            self.cfg.layers,
            batch_first=True,
            dropout=self.cfg.dropout if self.cfg.layers > 1 else 0.0,
        )
        self.attn = AttentionPool(self.cfg.hidden)
        self.state_proj = nn.Linear(2 * self.cfg.hidden, self.cfg.hidden)
        self.mdn = MDNHead(self.cfg)
        self.readout = ReadoutHead(self.cfg)

    # -- state assembly ----------------------------------------------------
    def _state(self, lstm_out: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        return torch.tanh(self.state_proj(torch.cat([lstm_out, context], dim=-1)))

    # -- history encode --------------------------------------------------
    def encode(self, x: torch.Tensor):
        """x: (B, 20, 11). Returns (state, context, attn_weights, (h_n, c_n))."""
        outputs, (h_n, c_n) = self.lstm(x)
        context, weights = self.attn(outputs)
        state = self._state(outputs[:, -1, :], context)
        return state, context, weights, (h_n, c_n)

    def encode_all(self, x: torch.Tensor):
        """Like `encode` but also returns the per-step head state (B, T, H), so
        surprise can be read along the history in one pass."""
        outputs, (h_n, c_n) = self.lstm(x)
        context, weights = self.attn(outputs)
        ctx_b = context.unsqueeze(1).expand(-1, outputs.shape[1], -1)
        states = torch.tanh(self.state_proj(torch.cat([outputs, ctx_b], dim=-1)))
        return states, context, weights, (h_n, c_n)

    # -- one rollout step ----------------------------------------------
    def step(self, x_t: torch.Tensor, hidden, context: torch.Tensor):
        """x_t: (B, 11) next input. Returns (state, hidden)."""
        out, hidden = self.lstm(x_t.unsqueeze(1), hidden)
        state = self._state(out[:, -1, :], context)
        return state, hidden

    def forward(self, x: torch.Tensor):
        state, context, weights, _ = self.encode(x)
        return self.readout.prob(state), weights


def save(model: HorizonModel, path) -> None:
    torch.save({"config": asdict(model.cfg), "state_dict": model.state_dict()}, path)


def load(path, map_location="cpu") -> HorizonModel:
    # blob is {"config": dict[str, int|float], "state_dict": OrderedDict[str, Tensor]}
    blob = torch.load(path, map_location=map_location, weights_only=True)
    model = HorizonModel(ModelConfig(**blob["config"]))
    model.load_state_dict(blob["state_dict"])
    model.eval()
    return model
