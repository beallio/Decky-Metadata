from backend import storage


def test_update_blobs_survive_fresh_load(tmp_path) -> None:
    data_file = tmp_path / "decky_metadata.json"
    data = storage.default_data()
    data["update_settings"] = {"update_channel": "development"}
    data["update_check_cache"] = {"last_available_tag": "v0.4.0"}
    storage.save_data(data_file, data)
    loaded = storage.load_data(data_file, None, None, lambda *args, **kwargs: None)
    assert loaded is not None
    payload = loaded[0]
    assert payload["update_settings"]["update_channel"] == "development"
    assert payload["update_check_cache"]["last_available_tag"] == "v0.4.0"
