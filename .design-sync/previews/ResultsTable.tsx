import React from 'react';
import { ResultsTable } from '@athlink/design-system';

const columns = [
  { key: 'rk', label: 'Rank' },
  { key: 'sail', label: 'Sail' },
  { key: 'name', label: 'Athlete', align: 'left' as const },
  { key: 'club', label: 'Club', align: 'left' as const },
  { key: 'r1', label: 'R1' },
  { key: 'r2', label: 'R2' },
  { key: 'r3', label: 'R3' },
  { key: 'net', label: 'Net' },
];

const rows = [
  { id: 1, rk: 1, sail: 'HKG 929', name: 'Chan Ka Lok', club: 'Hebe Haven YC', r1: 2, r2: 1, r3: 5, net: 8 },
  { id: 2, rk: 2, sail: 'HKG 845', name: 'Wong Tsz Yan', club: 'RHKYC', r1: 4, r2: 3, r3: 4, net: 11 },
  { id: 3, rk: 3, sail: 'HKG 712', name: 'Lee Ho Yin', club: 'Aberdeen BC', r1: 1, r2: 7, r3: 6, net: 14 },
  { id: 4, rk: 4, sail: 'HKG 660', name: 'Cheung Mei Ling', club: 'Hebe Haven YC', r1: 6, r2: 5, r3: 8, net: 19 },
  { id: 5, rk: 5, sail: 'HKG 503', name: 'Ng Chun Hei', club: 'RHKYC', r1: 9, r2: 4, r3: 7, net: 20 },
];

export const Default = () => <ResultsTable columns={columns} rows={rows} />;
