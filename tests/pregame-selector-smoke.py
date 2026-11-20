#!/usr/bin/env python3
"""Offline round-selection regression tests for production browser preflight.

Requires the pinned Playwright package only for importing the production
preflight module; no browser launches or external requests occur here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parent.parent
SELECT = runpy.run_path(str(ROOT / "tests" / "production-preflight.py"))["select_target"]


class PregameSelectionTests(unittest.TestCase):
    """Validate exact scheduled-round routing and failure boundaries."""

    def test_before_championship_points_to_game_one(self) -> None:
        target = SELECT(datetime(2026, 11, 20, 13, 25, tzinfo=timezone.utc))
        self.assertEqual(target["game"], 1)
        self.assertIn("game=1#experiment", target["site"])
        self.assertTrue(target["source"].endswith("/xLgOJ6cb.pgn"))

    def test_each_of_fourteen_schedule_boundaries(self) -> None:
        import json
        registry = json.loads((ROOT / "data/broadcast-2026.json").read_text())
        for round_data in registry["rounds"]:
            planned = datetime.fromisoformat(
                round_data["startsAt"].replace("Z", "+00:00")
            )
            before = planned - timedelta(minutes=35)
            with self.subTest(game=round_data["game"]):
                target = SELECT(before)
                self.assertEqual(target["game"], round_data["game"])
                self.assertEqual(target["roundId"], round_data["roundId"])
                self.assertEqual(target["source"], round_data["pgnUrl"])
                self.assertEqual(target["scheduledStartAt"], round_data["startsAt"])
                self.assertIn(
                    f'game={round_data["game"]}#experiment', target["site"]
                )

    def test_after_previous_round_window_points_to_next(self) -> None:
        target = SELECT(datetime(2026, 11, 25, 2, tzinfo=timezone.utc))
        self.assertEqual(target["game"], 2)
        self.assertEqual(SELECT(datetime(
            2026, 11, 27, 10, tzinfo=timezone.utc
        ))["game"], 4)

    def test_within_scheduled_round_window_keeps_that_round(self) -> None:
        target = SELECT(datetime(2026, 11, 24, 23, tzinfo=timezone.utc))
        self.assertEqual(target["game"], 1)

    def test_postmatch_falls_back_to_last_published_round(self) -> None:
        target = SELECT(datetime(2026, 12, 20, 12, tzinfo=timezone.utc))
        self.assertEqual(target["game"], 14)

    def test_naive_clock_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            SELECT(datetime(2026, 11, 24, 13, 25))


if __name__ == "__main__":
    unittest.main()
