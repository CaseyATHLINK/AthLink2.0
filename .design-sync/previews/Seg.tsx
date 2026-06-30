import React from 'react';
import { Seg } from '@athlink/design-system';

const fleets = [
  { value: 'overall', label: 'Overall' },
  { value: 'gold', label: 'Gold fleet' },
  { value: 'silver', label: 'Silver fleet' },
];

export const ThreeOption = () => {
  const [v, setV] = React.useState('overall');
  return <Seg options={fleets} value={v} onChange={setV} />;
};

export const TwoOption = () => {
  const [v, setV] = React.useState('results');
  return (
    <Seg
      options={[
        { value: 'results', label: 'Results' },
        { value: 'athletes', label: 'Athletes' },
      ]}
      value={v}
      onChange={setV}
    />
  );
};
