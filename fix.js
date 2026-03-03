const fs = require('fs');

['components/calendar/OfficeCalendarGrid.tsx', 'components/calendar/PharmacyTechCalendarGrid.tsx'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Regex string builder to safely match the problematic block starting after }
  const regexStr = '  return matching\\.map\\(\\(s, i\\) => \\{\\s*const isMe = currentUser && s[^]*?<span key=\\{i\\} className=\\{cn\\(nameTextStyle, isMe\\?[^]*?\\)\\}>\\s*\\{getUserName\\(s\\)\\}\\s*</span>\\s*\\);\\s*\\}\\);';
  
  const regex = new RegExp(regexStr, 'g');
  const countBefore = (content.match(regex) || []).length;
  console.log(`Found ${countBefore} occurrences in ${file}`);

  let replacedContent = content.replace(regex, '');

  // Ensure double trailing "}" are condensed nicely
  replacedContent = replacedContent.replace(/\}\s*\}/g, '}');

  fs.writeFileSync(file, replacedContent);
});
console.log('Fixed');
