import React from 'react';
import { renderToString } from 'react-dom/server';
import { PharmacyTechCalendarGrid } from './components/calendar/PharmacyTechCalendarGrid';
import { OfficeCalendarGrid } from './components/calendar/OfficeCalendarGrid';

// simple mock shift setup to check array mapping errors
const mockShift = {
  id: "1", date: "2026-02-01", department_id: 1, shift_type: "เช้า", user_id: "test", department_name: "ER"
};

try {
  renderToString(<PharmacyTechCalendarGrid year={2026} month={2} shifts={[mockShift as any]} viewMode="all" onDayClick={()=>{}} />);
  console.log("PT with data ok");
} catch(e) { console.error("PT err:", e) }

try {
  renderToString(<OfficeCalendarGrid year={2026} month={2} shifts={[mockShift as any]} viewMode="all" onDayClick={()=>{}} />);
  console.log("Office with data ok");
} catch(e) { console.error("Office err:", e) }
