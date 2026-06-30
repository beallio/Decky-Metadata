import main


def make_plugin() -> main.Plugin:
    return main.Plugin.__new__(main.Plugin)


def test_ign_title_acceptance_rejects_same_series_wrong_subtitle() -> None:
    plugin = make_plugin()

    assert (
        plugin._ign_title_acceptable(
            "Assassin's Creed: Director's Cut",
            "Assassin's Creed Valhalla",
        )
        is False
    )


def test_ign_title_acceptance_rejects_unrelated_title() -> None:
    plugin = make_plugin()

    assert plugin._ign_title_acceptable("Wobbly Life", "Totally Reliable Delivery Service") is False


def test_ign_title_acceptance_allows_exact_and_near_titles() -> None:
    plugin = make_plugin()

    assert plugin._ign_title_acceptable("Wobbly Life", "Wobbly Life") is True
    assert (
        plugin._ign_title_acceptable(
            "Assassin's Creed: Director's Cut",
            "Assassin's Creed Director's Cut Edition",
        )
        is True
    )
