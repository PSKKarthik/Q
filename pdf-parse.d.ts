// Type declaration for the pdf-parse lib sub-path.
// Importing 'pdf-parse/lib/pdf-parse.js' bypasses the broken test-file bootstrap
// in pdf-parse/index.js (which calls fs.readFileSync on a non-existent test file
// when module.parent is undefined under webpack).
declare module 'pdf-parse/lib/pdf-parse.js' {
  import PdfParse = require('pdf-parse')
  export = PdfParse
}
