"""HORIZON inference backend.

Serves the frozen frontend contract (docs/api-contract.md) from a trained
world model. Runs in two modes:

  live  - model.pt + scaler.joblib + states.parquet present in artifacts/;
          real rollout for any (capture, host, t) in the dataset.
  stub  - no artifacts; the 3 demo hosts are served from the pre-generated
          horizon-ui/public/mock/ files, everything else returns 503.

See docs/api-endpoints.md.
"""

__version__ = "0.1.0"

FEATURE_KEYS = [
    "n_flows",
    "n_distinct_dst_ip",
    "n_distinct_dst_port",
    "new_peer_rate",
    "fail_ratio",
    "bytes_out",
    "bytes_in",
    "io_ratio",
    "mean_duration",
    "external_ratio",
]

# features that are log1p'd before standardisation (technical.md 1.2)
LOG1P_KEYS = {
    "n_flows",
    "n_distinct_dst_ip",
    "n_distinct_dst_port",
    "bytes_out",
    "bytes_in",
    "io_ratio",
    "mean_duration",
}

HISTORY = 20
HORIZON = 20
N_SAMPLES = 50
N_FEATURES = len(FEATURE_KEYS)  # 10 predicted
N_INPUT = N_FEATURES + 1        # + intervention channel = 11
SCHEMA_VERSION = "v4.0"
