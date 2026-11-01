const assert=require('node:assert/strict');const fs=require('fs');
const component=fs.readFileSync('src/components/modern/ModernShuffleCard.tsx','utf8');
assert.match(component,/const photoLoading = feedIndex < 4 \? "eager" : "lazy"/);
assert.match(component,/const photoPriority = feedIndex < 4 \? "high" : "low"/);
assert.match(component,/\(\(a\.feedIndex \?\? 0\) < 4\) === \(\(b\.feedIndex \?\? 0\) < 4\)/);
assert.match(component,/a\.profile\.bio === b\.profile\.bio/);
assert.match(component,/a\.profile\.showOnline === b\.profile\.showOnline/);
assert.match(component,/a\.profile\.photo === b\.profile\.photo/);
console.log('PASS_MODERN_SHUFFLE_CARD_MEDIA_AND_LIVE_UPDATE');