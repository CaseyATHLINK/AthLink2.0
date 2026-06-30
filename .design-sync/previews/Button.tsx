import React from 'react';
import { Button } from '@athlink/design-system';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
    <Button variant="cta">Upload results</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="sky">View athletes</Button>
    <Button variant="amber">Needs review</Button>
    <Button variant="green">Verified</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <Button variant="cta">Publish</Button>
    <Button variant="cta" disabled>Publish</Button>
  </div>
);
