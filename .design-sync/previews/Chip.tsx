import React from 'react';
import { Chip } from '@athlink/design-system';

export const Default = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Chip>Hong Kong</Chip>
    <Chip>48 entries</Chip>
    <Chip>3 races</Chip>
    <Chip>1 discard</Chip>
  </div>
);
