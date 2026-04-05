import { describe, it, expect } from 'vitest';
import { extractInvoiceFields } from '../../../src/xml/invoice-field-extractor.js';

describe('extractInvoiceFields', () => {
  describe('FA format (FA_2, FA_3)', () => {
    it('extracts P_1 and P_2 from <Fa> section', () => {
      const xml = `
        <Faktura>
          <Fa>
            <P_1>2026-04-08</P_1>
            <P_2>FV/2026/001</P_2>
          </Fa>
        </Faktura>`;
      expect(extractInvoiceFields(xml)).toEqual({
        invoiceNumber: 'FV/2026/001',
        invoiceDate: '2026-04-08',
      });
    });

    it('handles full FA_3 XML with other elements', () => {
      const xml = `
        <Faktura>
          <Naglowek><KodFormularza>FA</KodFormularza></Naglowek>
          <Podmiot1><NIP>1234567890</NIP></Podmiot1>
          <Fa>
            <KodWaluty>PLN</KodWaluty>
            <P_1>2026-01-15</P_1>
            <P_1M>Warszawa</P_1M>
            <P_2>FA/2026/0042</P_2>
            <P_6>2026-01-15</P_6>
            <P_15>1000.00</P_15>
          </Fa>
        </Faktura>`;
      expect(extractInvoiceFields(xml)).toEqual({
        invoiceNumber: 'FA/2026/0042',
        invoiceDate: '2026-01-15',
      });
    });
  });

  describe('FA_RR format', () => {
    it('extracts P_4B and P_4C from <FakturaRR> section', () => {
      const xml = `
        <Faktura>
          <FakturaRR>
            <P_4A>2026-06-01</P_4A>
            <P_4B>2026-06-05</P_4B>
            <P_4C>RR/2026/001</P_4C>
          </FakturaRR>
        </Faktura>`;
      expect(extractInvoiceFields(xml)).toEqual({
        invoiceNumber: 'RR/2026/001',
        invoiceDate: '2026-06-05',
      });
    });
  });

  describe('namespaced XML', () => {
    it('handles XML with namespace prefixes', () => {
      const xml = `
        <tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2023/06/29/12648/">
          <tns:Fa>
            <tns:P_1>2026-03-20</tns:P_1>
            <tns:P_2>NS/2026/007</tns:P_2>
          </tns:Fa>
        </tns:Faktura>`;
      expect(extractInvoiceFields(xml)).toEqual({
        invoiceNumber: 'NS/2026/007',
        invoiceDate: '2026-03-20',
      });
    });

    it('handles default namespace', () => {
      const xml = `
        <Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
          <Fa>
            <P_1>2026-02-14</P_1>
            <P_2>DEF/2026/001</P_2>
          </Fa>
        </Faktura>`;
      expect(extractInvoiceFields(xml)).toEqual({
        invoiceNumber: 'DEF/2026/001',
        invoiceDate: '2026-02-14',
      });
    });
  });

  describe('error cases', () => {
    it('throws when root <Faktura> is missing', () => {
      const xml = '<Invoice><P_1>2026-01-01</P_1></Invoice>';
      expect(() => extractInvoiceFields(xml)).toThrow('missing <Faktura> root element');
    });

    it('throws when neither <Fa> nor <FakturaRR> present', () => {
      const xml = '<Faktura><Naglowek/></Faktura>';
      expect(() => extractInvoiceFields(xml)).toThrow('Expected <Fa><P_1>/<P_2>');
    });

    it('throws when P_1 is missing from <Fa>', () => {
      const xml = '<Faktura><Fa><P_2>FV/001</P_2></Fa></Faktura>';
      expect(() => extractInvoiceFields(xml)).toThrow('Expected <Fa><P_1>/<P_2>');
    });

    it('throws when P_2 is missing from <Fa>', () => {
      const xml = '<Faktura><Fa><P_1>2026-01-01</P_1></Fa></Faktura>';
      expect(() => extractInvoiceFields(xml)).toThrow('Expected <Fa><P_1>/<P_2>');
    });

    it('throws when P_1 is empty', () => {
      const xml = '<Faktura><Fa><P_1></P_1><P_2>FV/001</P_2></Fa></Faktura>';
      expect(() => extractInvoiceFields(xml)).toThrow('Expected <Fa><P_1>/<P_2>');
    });

    it('throws when P_2 is empty', () => {
      const xml = '<Faktura><Fa><P_1>2026-01-01</P_1><P_2></P_2></Fa></Faktura>';
      expect(() => extractInvoiceFields(xml)).toThrow('Expected <Fa><P_1>/<P_2>');
    });

    it('throws for completely invalid XML', () => {
      expect(() => extractInvoiceFields('not xml at all')).toThrow();
    });
  });
});
