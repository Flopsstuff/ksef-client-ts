import { describe, it, expect } from 'vitest';
import { xmlToObject } from '../../../src/validation/xml-to-object.js';

describe('xmlToObject', () => {
  it('converts simple nested elements to object', () => {
    const xml = `<Root><Name>Test</Name><Value>123</Value></Root>`;
    const result = xmlToObject(xml);

    expect(result.errors).toEqual([]);
    expect(result.rootElement).toBe('Root');
    expect(result.object).toEqual({ Name: 'Test', Value: '123' });
  });

  it('converts repeated elements to arrays', () => {
    const xml = `<List><Item>A</Item><Item>B</Item><Item>C</Item></List>`;
    const result = xmlToObject(xml);

    expect(result.errors).toEqual([]);
    expect(result.object).toEqual({ Item: ['A', 'B', 'C'] });
  });

  it('handles attributes with @ prefix', () => {
    const xml = `<Root attr1="val1" attr2="val2"><Child>text</Child></Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({
      '@attr1': 'val1',
      '@attr2': 'val2',
      Child: 'text',
    });
  });

  it('strips namespace prefixes from elements and attributes', () => {
    const xml = `<tns:Faktura xmlns:tns="http://example.com" tns:version="1">
      <tns:Naglowek><tns:Kod>FA</tns:Kod></tns:Naglowek>
    </tns:Faktura>`;
    const result = xmlToObject(xml);

    expect(result.rootElement).toBe('Faktura');
    expect(result.namespace).toBe('http://example.com');
    expect(result.object).toEqual({
      '@version': '1',
      Naglowek: { Kod: 'FA' },
    });
  });

  it('handles deeply nested elements', () => {
    const xml = `<A><B><C><D>deep</D></C></B></A>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({ B: { C: { D: 'deep' } } });
  });

  it('handles mixed attributes and text on leaf elements', () => {
    const xml = `<Root><Code system="FA">123</Code></Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({
      Code: { '@system': 'FA', '#text': '123' },
    });
  });

  it('handles empty elements', () => {
    const xml = `<Root><Empty/><Value>test</Value></Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({ Empty: '', Value: 'test' });
  });

  it('skips xmlns declarations from attributes', () => {
    const xml = `<Root xmlns="http://example.com" xmlns:tns="http://other.com">
      <Child>text</Child>
    </Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({ Child: 'text' });
    // No @xmlns keys in output
    expect(Object.keys(result.object!).some(k => k.includes('xmlns'))).toBe(false);
  });

  it('detects namespace from root element', () => {
    const xml = `<tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2025/06/25/13775/">
      <tns:Naglowek/>
    </tns:Faktura>`;
    const result = xmlToObject(xml);

    expect(result.namespace).toBe('http://crd.gov.pl/wzor/2025/06/25/13775/');
  });

  it('returns errors for malformed XML', () => {
    const xml = `<Root><Unclosed`;
    const result = xmlToObject(xml);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.object).toBeNull();
  });

  it('returns errors for empty input', () => {
    const result = xmlToObject('');
    expect(result.object).toBeNull();
  });

  it('handles arrays of complex elements', () => {
    const xml = `<Root>
      <Item><Name>A</Name><Val>1</Val></Item>
      <Item><Name>B</Name><Val>2</Val></Item>
    </Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({
      Item: [
        { Name: 'A', Val: '1' },
        { Name: 'B', Val: '2' },
      ],
    });
  });

  it('handles CDATA sections', () => {
    const xml = `<Root><Data><![CDATA[Some <special> content]]></Data></Root>`;
    const result = xmlToObject(xml);

    expect(result.object).toEqual({ Data: 'Some <special> content' });
  });
});
