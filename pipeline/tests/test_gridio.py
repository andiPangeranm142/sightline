"""Tests for pipeline coordinate validation."""

import unittest

from pipeline.gridio import normalise_xy


class NormaliseXYTests(unittest.TestCase):
    def test_valid_bounds_and_clamping(self) -> None:
        bounds = {"min": {"x": 0, "y": 0}, "max": {"x": 100, "y": 200}}
        self.assertEqual(normalise_xy(50, 100, bounds), (500.0, 500.0, True))
        self.assertEqual(normalise_xy(-10, 250, bounds), (0.0, 1000.0, False))

    def test_degenerate_or_reversed_bounds_are_invalid(self) -> None:
        for max_x in (0, -1):
            with self.subTest(max_x=max_x):
                bounds = {"min": {"x": 0, "y": 0}, "max": {"x": max_x, "y": 200}}
                self.assertEqual(normalise_xy(0, 100, bounds), (500.0, 500.0, False))

        bounds = {"min": {"x": 0, "y": 0}, "max": {"x": 100, "y": 0}}
        self.assertEqual(normalise_xy(50, 0, bounds), (500.0, 500.0, False))


if __name__ == "__main__":
    unittest.main()