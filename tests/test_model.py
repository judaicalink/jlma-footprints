"""Tests of the readers of dates and coordinates (python3 -m unittest discover tests)."""

import unittest

from fp import model


class Dates(unittest.TestCase):
    def test_edtf(self):
        self.assertEqual(model.edtf_years("1924~"), (1924, 1924))
        self.assertEqual(model.edtf_years("1900?~/1961?~"), (1900, 1961))
        self.assertEqual(model.edtf_years("186x"), (1860, 1869))
        self.assertEqual(model.edtf_years("157x?~"), (1570, 1579))
        self.assertEqual(model.edtf_years("1948~/unknown"), (1948, 1948))
        self.assertEqual(model.edtf_years("../1862"), (1862, 1862))
        self.assertEqual(model.edtf_years("1650-03-12"), (1650, 1650))
        self.assertIsNone(model.edtf_years("unknown"))
        self.assertIsNone(model.edtf_years("1961/1900"))
        self.assertIsNone(model.edtf_years("2150"))


class Places(unittest.TestCase):
    def test_wkt(self):
        self.assertEqual(model.parse_wkt("POINT(16.37208 48.20849)"), (16.3721, 48.2085))
        self.assertIsNone(model.parse_wkt("POINT(0 0)"))
        self.assertIsNone(model.parse_wkt("POINT(200 10)"))

    def test_number(self):
        self.assertEqual(model.number(model.FP + "book/4452", "book"), 4452)
        self.assertIsNone(model.number(model.FP + "book/4452", "imprint"))


if __name__ == "__main__":
    unittest.main()
