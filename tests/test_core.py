import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
import core  # noqa: E402
import geo  # noqa: E402


class GeoTests(unittest.TestCase):
    def test_every_city_inside_latvia(self):
        for c in geo.CITIES:
            self.assertIsNotNone(geo.muni_at(c['lat'], c['lng']), c['name'])

    def test_known_territories(self):
        T = geo.DEFAULT_MUNI_TERRITORY
        self.assertEqual(geo.territory_at(56.5047, 21.0108, T), 'kurzeme')  # Liepaja
        self.assertEqual(geo.territory_at(56.9496, 24.1052, T), 'pieriga')  # Riga
        self.assertEqual(geo.territory_at(55.8747, 26.5362, T), 'latgale')  # Daugavpils
        self.assertEqual(geo.territory_at(57.5384, 25.4264, T), 'vidzeme')  # Valmiera
        self.assertIsNone(geo.territory_at(59.4, 24.7, T))  # Tallinn

    def test_border_distance(self):
        self.assertGreater(geo.dist_to_border(56.9496, 24.1052), 5000)
        self.assertLess(geo.dist_to_border(55.88, 26.54), 40000)


class TimeTests(unittest.TestCase):
    def test_window_elapsed(self):
        n = int(datetime.datetime(2026, 7, 10, 6, 0, tzinfo=datetime.timezone.utc).timestamp() * 1000)
        win = {'start': '08:00', 'end': '21:00'}
        self.assertEqual(core.eff_elapsed(n, n + 2 * core.DAY, win) / 3600000, 26)
        self.assertEqual(core.eff_elapsed(n, n + core.DAY, None), core.DAY)

    def test_dst(self):
        self.assertEqual(core.riga_offset_ms(int(datetime.datetime(2026, 7, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)), 3 * 3600000)
        self.assertEqual(core.riga_offset_ms(int(datetime.datetime(2026, 12, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)), 2 * 3600000)

    def test_log_chain(self):
        g = {'log': []}
        core.log(g, 'a', 'one')
        core.log(g, 'b', 'two')
        self.assertTrue(core.verify_log(g))
        g['log'][0]['text'] = 'tampered'
        self.assertFalse(core.verify_log(g))


if __name__ == '__main__':
    unittest.main()
