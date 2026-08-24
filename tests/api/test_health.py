def test_health_check_does_not_claim_readiness_before_bootstrap(client):
    """The process heartbeat must not masquerade as application readiness."""
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "starting"
    assert "service" in response.json()
