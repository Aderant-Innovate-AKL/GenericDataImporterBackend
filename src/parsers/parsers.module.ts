import { Module } from '@nestjs/common';
import { CsvParser } from './csv.parser';
import { ExcelParser } from './excel.parser';
import { GenericParser } from './generic.parser';
import { ParserFactory } from './parser.factory';
import { ExtractionModule } from '../extraction/extraction.module';

@Module({
  imports: [ExtractionModule],
  providers: [CsvParser, ExcelParser, GenericParser, ParserFactory],
  exports: [ParserFactory, CsvParser, ExcelParser, GenericParser],
})
export class ParsersModule {}

