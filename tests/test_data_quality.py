import unittest
from data_pipeline.availability import as_of
from data_pipeline.normalize import normalize_finmind

class Contracts(unittest.TestCase):
    def test_revision_and_proxy(self):
        versions=[{'availability_basis':'observed','available_from':'2024-01-01T18:00:00+08:00','value':1},{'availability_basis':'observed','available_from':'2024-01-03T18:00:00+08:00','value':9}]
        self.assertEqual(as_of(versions,'2024-01-02T08:30:00+08:00')['value'],1)
        self.assertIsNone(as_of([{'availability_basis':'proxy'}],'2024-01-02T08:30:00+08:00'))
    def test_units_missing_not_zero(self):
        prices=[{'date':'2024-01-01','open':100,'max':102,'min':99,'close':101,'Trading_Volume':100000,'Trading_money':10000000}]
        row=normalize_finmind(prices,[],[{'date':'2024-01-01','MarginPurchaseTodayBalance':2}],{})[0]
        self.assertEqual(row['margin_balance_shares'],2000);self.assertNotIn('foreign_net_shares',row);self.assertEqual(row['availability_basis'],'proxy')

if __name__=='__main__':unittest.main()
