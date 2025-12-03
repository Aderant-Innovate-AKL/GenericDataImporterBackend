import { Module } from '@nestjs/common';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { ParserFactory } from './parser.factory';

@Module({
  providers: [CsvParser, ExcelParser, ParserFactory],
  exports: [ParserFactory, CsvParser, ExcelParser],
})
export class ParsersModule {}

