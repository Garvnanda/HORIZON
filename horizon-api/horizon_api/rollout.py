"""Autoregressive sampled rollout and counterfactual interventions (technical.md 4, 5.3)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

from . import FEATURE_KEYS, HORIZON, N_SAMPLES
from .model import HorizonModel

_IDX = {k: i for i, k in enumerate(FEATURE_KEYS)}

# per api-contract 3.2
ISOLATE_CLAMP = ["n_distinct_dst_ip", "n_distinct_dst_port", "bytes_out", "external_ratio"]
RATE_LIMIT_CLAMP = ["n_flows", "bytes_out"]


@dataclass
class Intervention:
    """Pushes selected feature dims toward a quiet baseline in standardised space."""

    name: str
    applied_at_step: int
    target_z: np.ndarray          # (10,) standardised target for the clamped dims
    clamp_idx: np.ndarray         # indices into FEATURE_KEYS
    strength: float               # 1.0 = snap to target, 0.5 = halfway

    def apply(self, s: torch.Tensor) -> torch.Tensor:
        # s: (B, 10) standardised sampled next state
        tgt = torch.tensor(self.target_z[self.clamp_idx], dtype=s.dtype, device=s.device)
        cur = s[:, self.clamp_idx]
        s = s.clone()
        # only ever pull DOWN toward the target; never raise a dim above where it is
        s[:, self.clamp_idx] = cur + self.strength * (torch.minimum(tgt, cur) - cur)
        return s


def make_intervention(name: str, history_z: np.ndarray) -> Intervention | None:
    """history_z: (20, 10) standardised history. None for do_nothing.

    Target = the host's own quiet baseline, but never above 0 (0 == the training
    mean, which is ~benign since ~98% of windows are benign). Clamping toward the
    history minimum alone misbehaves when the whole history is already the attack.
    """
    if name == "do_nothing":
        return None
    target_z = np.minimum(0.0, history_z.min(axis=0))
    if name == "isolate_host":
        keys, strength = ISOLATE_CLAMP, 1.0
    elif name == "rate_limit":
        keys, strength = RATE_LIMIT_CLAMP, 0.5
    else:
        raise ValueError(f"unknown intervention {name!r}")
    return Intervention(
        name=name,
        applied_at_step=1,
        target_z=target_z,
        clamp_idx=np.array([_IDX[k] for k in keys]),
        strength=strength,
    )


@dataclass
class RolloutResult:
    p_curves: np.ndarray        # (n_samples, horizon)  per-sample attack prob
    trajectories: np.ndarray    # (n_samples, horizon, 10)  standardised states
    attention: np.ndarray       # (20,)  history attention weights

    @property
    def p_mean(self) -> np.ndarray:
        return self.p_curves.mean(axis=0)

    @property
    def p_frac(self) -> np.ndarray:
        return (self.p_curves > 0.5).mean(axis=0)

    @property
    def spread(self) -> np.ndarray:
        return self.p_curves.std(axis=0)

    @property
    def divergence(self) -> float:
        # how much the futures disagree: prob spread + state spread, averaged over the horizon
        prob_disagree = self.spread.mean()
        state_disagree = self.trajectories.std(axis=0).mean()
        return float(prob_disagree + 0.1 * state_disagree)

    def trajectory_mean_z(self) -> np.ndarray:
        return self.trajectories.mean(axis=0)  # (horizon, 10)


@torch.no_grad()
def rollout(
    model: HorizonModel,
    history_z: np.ndarray,
    *,
    intervention: Intervention | None = None,
    horizon: int = HORIZON,
    n_samples: int = N_SAMPLES,
    seed: int = 0,
    platt: tuple[float, float] | None = None,
) -> RolloutResult:
    """history_z: (20, 10) standardised. Returns per-sample prob curves + trajectories.

    The 50 samples run as the batch dimension: one rollout is `horizon` sequential
    LSTM steps over a (n_samples, .) state. `platt` (a, b) rescales the readout
    logit as sigmoid(a*logit + b) - the notebook fits it on the val split because
    the raw BCE readout is badly overconfident.
    """
    gen = torch.Generator().manual_seed(seed)
    dev = next(model.parameters()).device

    def readout_prob(st: torch.Tensor) -> torch.Tensor:
        if platt is None:
            return model.readout.prob(st)
        return torch.sigmoid(platt[0] * model.readout(st) + platt[1])

    # (20, 11): append intervention channel = 0 for the observed history
    x_hist = np.concatenate([history_z, np.zeros((history_z.shape[0], 1))], axis=1)
    x = torch.tensor(x_hist, dtype=torch.float32, device=dev).unsqueeze(0).repeat(n_samples, 1, 1)

    state, context, weights, hidden = model.encode(x)

    p_curves = np.empty((n_samples, horizon), dtype=np.float64)
    trajs = np.empty((n_samples, horizon, history_z.shape[1]), dtype=np.float64)

    zero_chan = torch.zeros((n_samples, 1), device=dev)
    for k in range(horizon):
        p = readout_prob(state)                             # (n_samples,)
        s = model.mdn.sample(state, generator=gen)          # (n_samples, 10)
        iv_on = intervention is not None and (k + 1) >= intervention.applied_at_step
        if iv_on:
            s = intervention.apply(s)
        p_curves[:, k] = p.cpu().numpy()
        trajs[:, k, :] = s.cpu().numpy()

        # intervention channel stays 0: the model never saw it != 0 in training,
        # so driving it is pure OOD noise. The counterfactual acts by clamping the
        # fed-back state toward a quiet baseline, which the model does understand.
        x_t = torch.cat([s, zero_chan], dim=-1)             # (n_samples, 11)
        state, hidden = model.step(x_t, hidden, context)

    return RolloutResult(p_curves=p_curves, trajectories=trajs, attention=weights[0].cpu().numpy())
