"""Tests for landing projection and supplement quality handling."""

import unittest
from unittest.mock import patch

from pipeline.aggregate import Aggregator, SeriesProcessor
from pipeline.landing import is_throwable, project_landing


class LandingTests(unittest.TestCase):
    def test_timeout_is_not_a_landing(self) -> None:
        position = {"x": 0, "y": 0, "z": 0}
        view = {"x": 0.6, "y": 0, "z": 0.8}
        velocity = {"x": 0, "y": 0, "z": 0}
        self.assertIsNone(project_landing(position, view, velocity, "recon-bolt"))
        self.assertIsNotNone(project_landing(
            position, {"x": 1, "y": 0, "z": 0}, velocity, "recon-bolt"))

    def test_nonballistic_abilities_are_excluded(self) -> None:
        for ability in ("gatecrash", "curveball", "cloudburst"):
            with self.subTest(ability=ability):
                self.assertFalse(is_throwable(ability))
        self.assertTrue(is_throwable("recon-bolt"))

    def test_gap_exceeded_is_joined_but_not_projected(self) -> None:
        agg = Aggregator(10, 10)
        processor = SeriesProcessor(agg, "unused")
        bounds = {"min": {"x": 0, "y": 0}, "max": {"x": 10000, "y": 10000}}
        processor.ability_events["cast"] = {
            "map": "Test", "bounds": bounds, "team_id": "team",
            "player_id": "player", "ability": "recon-bolt",
        }
        interp = {
            "position": {"x": 500, "y": 500, "z": 0},
            "view": {"x": 1, "y": 0, "z": 0},
            "velocity": {"x": 0, "y": 0, "z": 0},
        }
        records = [
            {"in_grid": True, "grid_event_id": "cast", "quality": quality,
             "interpolated": interp}
            for quality in ("gap_exceeded", "ok")
        ]
        with patch("pipeline.aggregate.stream_jsonl_zst", return_value=iter(records)):
            processor.process_supplement("unused")
        self.assertEqual(agg.suppl_joined, 2)
        self.assertEqual(agg.landing_total, 1)


if __name__ == "__main__":
    unittest.main()