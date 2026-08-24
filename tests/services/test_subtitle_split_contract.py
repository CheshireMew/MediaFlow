from backend.contracts import load_contract
from backend.utils.subtitle_text_splitter import get_best_split_index


def test_backend_subtitle_splitter_matches_shared_contract_cases():
    contract = load_contract("subtitle-split-contract.json")
    for case in contract["cases"]:
        assert get_best_split_index(case["text"]) == case["expected_split_index"], case["id"]
