import React from 'react';
import { ClassBadge } from '@athlink/design-system';

export const Classes = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <ClassBadge>29er</ClassBadge>
    <ClassBadge>ILCA 6</ClassBadge>
    <ClassBadge>Optimist</ClassBadge>
    <ClassBadge>49er</ClassBadge>
  </div>
);
