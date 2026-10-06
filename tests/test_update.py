import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('updater',ROOT/'scripts/update_holidays.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
URL='https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm'
RAW=(ROOT/'tests/fixtures/2026.html').read_text()

class UpdateTests(unittest.TestCase):
    def test_full_2026(self):
        rows=u.parse_notice(RAW,'2026',URL)['holidays']
        self.assertEqual(len(rows),7)
        self.assertEqual(rows[1]['start'],'2026-02-15')
        self.assertEqual(rows[-1]['end'],'2026-10-07')
        self.assertEqual(sum((u.dt.date.fromisoformat(r['end'])-u.dt.date.fromisoformat(r['start'])).days+1 for r in rows),33)
    def test_combined_cross_month_and_single_day(self):
        rows=u.parse_notice((ROOT/'tests/fixtures/2025.html').read_text(),'2025','https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm')['holidays']
        self.assertEqual(len(rows),6)
        self.assertEqual(rows[0]['start'],rows[0]['end'])
        self.assertEqual(rows[1]['end'],'2025-02-04')
        self.assertEqual(rows[-1]['level'],'high')
    def test_wrong_duration_rejected(self):
        with self.assertRaises(ValueError):u.parse_notice(RAW.replace('共9天','共8天'),'2026',URL)
    def test_missing_holiday_rejected(self):
        with self.assertRaises(ValueError):u.parse_notice(RAW.replace('七、国庆节','七、测试'),'2026',URL)
    def test_wrong_year_rejected(self):
        with self.assertRaises(ValueError):u.parse_notice(RAW,'2027',URL)
    def test_foreign_source_rejected(self):
        with self.assertRaises(ValueError):u.parse_notice(RAW,'2026','https://example.com/zhengce/test')
    def test_empty_discovery_is_failure(self):
        with self.assertRaises(ValueError):u.discover(lambda _:json.dumps({'code':200,'searchVO':{'listVO':[],'totalCount':0}}))
    def test_future_calendar_import(self):
        data=json.loads((ROOT/'data/holidays.json').read_text()); original=copy.deepcopy(data)
        notices={'2026':URL,'2027':URL.replace('7047091','9999999')}
        with patch.object(u,'discover',return_value=notices):
            result=u.update(data,lambda url: RAW if url==URL else RAW.replace('2026','2027'),now='2026-10-06T00:00:00Z')
        self.assertIn('2027',result['years']);self.assertEqual(data,original)
    def test_failure_preserves_data_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data').mkdir();p=root/'data/holidays.json'
            original=(ROOT/'data/holidays.json').read_bytes();p.write_bytes(original)
            with patch.object(u,'update',side_effect=ValueError('invalid notice')):self.assertEqual(u.run(root),1)
            self.assertEqual(p.read_bytes(),original)
            self.assertEqual(json.loads((root/'data/update-status.json').read_text())['state'],'error')

if __name__=='__main__':unittest.main()
