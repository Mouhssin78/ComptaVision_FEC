const xlsx = require('xlsx');
const path = require('path');
const filePath = path.join(__dirname, 'ExportFEC 2022.xlsx');
const workbook = xlsx.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
console.log(JSON.stringify(data[1]));
console.log(JSON.stringify(data[2]));
