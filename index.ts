import * as fs     from 'fs';
import * as parser from './parser';

let fileData: string = fs.readFileSync('data.txt','utf-8');
console.log('code was compiled successfully');
fs.writeFileSync('output.txt', parser.languageParser.parse(fileData).result)

