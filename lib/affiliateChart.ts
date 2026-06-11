export interface AffiliateChartPoint {
  label: string;
  value: number;
}

export interface AffiliateChart {
  title: string;
  points: AffiliateChartPoint[];
}

export const DEFAULT_AFFILIATE_CHART: AffiliateChart = {
  title: 'Earnings overview',
  points: [
    { label: 'Jan', value: 0 },
    { label: 'Feb', value: 0 },
    { label: 'Mar', value: 0 },
    { label: 'Apr', value: 0 },
    { label: 'May', value: 0 },
    { label: 'Jun', value: 0 },
  ],
};
