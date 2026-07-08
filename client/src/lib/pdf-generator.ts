import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { Quote, Invoice, InvoiceItem, QuoteItem, ApplicationSettings, User, DeliveryNote } from '@shared/schema';
import defaultLogoImage from '@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png';

interface CompanyInfo {
  name: string;
  tagline: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  bankName: string;
  iban: string;
  swift: string;
  siret: string;
  tva: string;
  logo?: string;
}

const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'MY JANTES',
  tagline: "L'EXPERT DE LA JANTE ALU",
  address: '46 rue de la convention',
  city: '62800 Lievin',
  phone: '03 21 40 80 53',
  email: 'contact@myjantes.com',
  website: 'www.myjantes.fr',
  bankName: 'SG WATTIGNIES (02958)',
  iban: 'FR76 3000 3029 5800 0201 6936 525',
  swift: 'SOGEFRPP',
  siret: '913 678 199 00021',
  tva: 'FR73 913 678 199',
};

function getCompanyInfoFromSettings(settings?: ApplicationSettings | null): CompanyInfo {
  if (!settings) return DEFAULT_COMPANY_INFO;
  return {
    name: settings.companyName || DEFAULT_COMPANY_INFO.name,
    tagline: settings.companyTagline || DEFAULT_COMPANY_INFO.tagline,
    address: settings.companyAddress || DEFAULT_COMPANY_INFO.address,
    city: settings.companyCity || DEFAULT_COMPANY_INFO.city,
    phone: settings.companyPhone || DEFAULT_COMPANY_INFO.phone,
    email: settings.companyEmail || DEFAULT_COMPANY_INFO.email,
    website: settings.companyWebsite || DEFAULT_COMPANY_INFO.website,
    bankName: DEFAULT_COMPANY_INFO.bankName,
    iban: settings.companyIban || DEFAULT_COMPANY_INFO.iban,
    swift: settings.companySwift || DEFAULT_COMPANY_INFO.swift,
    siret: settings.companySiret || DEFAULT_COMPANY_INFO.siret,
    tva: settings.companyTvaNumber || DEFAULT_COMPANY_INFO.tva,
    logo: settings.companyLogo || undefined,
  };
}

const COLORS = {
  primary: [220, 38, 38] as [number, number, number],
  primaryLight: [254, 242, 242] as [number, number, number],
  dark: [31, 41, 55] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  lightGray: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
};

async function getLogoBase64(customLogo?: string): Promise<string> {
  if (customLogo) {
    if (customLogo.startsWith('data:image')) return customLogo;
    try {
      const response = await fetch(customLogo);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) { console.error(e); }
  }
  const response = await fetch(defaultLogoImage);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function drawRoundedRect(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fillColor?: [number, number, number], strokeColor?: [number, number, number]) {
  if (fillColor) doc.setFillColor(...fillColor);
  if (strokeColor) {
    doc.setDrawColor(...strokeColor);
    doc.setLineWidth(0.3);
  }
  doc.roundedRect(x, y, w, h, r, r, fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'S');
}

function drawPremiumFooter(doc: jsPDF, companyInfo: CompanyInfo, margin: number) {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const footerHeight = 35; // Fixed height for both front and back
  const footerTop = pageHeight - footerHeight;
  const contentWidth = pageWidth - margin * 2;
  const colWidth = contentWidth / 3;
  const col1X = margin;
  const col2X = margin + colWidth;
  const col3X = margin + colWidth * 2;
  const titleColor: [number, number, number] = [85, 85, 85];
  const textColor: [number, number, number] = [119, 119, 119];
  const lineColor: [number, number, number] = [229, 229, 229];
  const bgColor: [number, number, number] = [247, 247, 247];

  doc.setFillColor(...bgColor);
  doc.rect(0, footerTop, pageWidth, footerHeight, 'F');

  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.3);
  doc.line(margin, footerTop, pageWidth - margin, footerTop);

  const titleY = footerTop + 7;
  const lineSpacing = 4;
  const textStartY = titleY + 5;

  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...titleColor);
  doc.text('PAIEMENT', col1X, titleY);
  doc.setFontSize(6.5).setFont('helvetica', 'normal').setTextColor(...textColor);
  doc.text('Carte bancaire • Espèces • Virement', col1X, textStartY);
  doc.setFont('helvetica', 'bold').setTextColor(...titleColor);
  doc.text('Paiement en ligne via Stripe / Klarna', col1X, textStartY + lineSpacing);

  doc.setDrawColor(...lineColor);
  doc.setLineWidth(0.2);
  doc.line(col2X - 3, footerTop + 3, col2X - 3, pageHeight - 4);

  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...titleColor);
  doc.text('COORDONNÉES BANCAIRES', col2X, titleY);
  doc.setFontSize(6.5).setFont('helvetica', 'normal').setTextColor(...textColor);
  doc.text(companyInfo.bankName, col2X, textStartY);
  doc.text(`IBAN : ${companyInfo.iban}`, col2X, textStartY + lineSpacing);
  doc.text(`BIC : ${companyInfo.swift}`, col2X, textStartY + lineSpacing * 2);

  doc.line(col3X - 3, footerTop + 3, col3X - 3, pageHeight - 4);

  doc.setFontSize(7).setFont('helvetica', 'bold').setTextColor(...titleColor);
  doc.text('INFORMATIONS LÉGALES', col3X, titleY);
  doc.setFontSize(6.5).setFont('helvetica', 'normal').setTextColor(...textColor);
  doc.text(`SIRET : ${companyInfo.siret} • TVA : ${companyInfo.tva}`, col3X, textStartY);
  doc.text(`${companyInfo.address}, ${companyInfo.city}`, col3X, textStartY + lineSpacing);
  doc.text(`${companyInfo.phone} • ${companyInfo.website}`, col3X, textStartY + lineSpacing * 2);
}

function formatClientInfo(clientInfo: any): { name: string; details: string[] } {
  let name = clientInfo?.companyName || (clientInfo?.firstName ? `${clientInfo.firstName} ${clientInfo.lastName}` : (clientInfo?.name || 'Client'));
  const details: string[] = [];
  if (clientInfo?.siret) details.push(`SIRET: ${clientInfo.siret}`);
  if (clientInfo?.tvaNumber) details.push(`TVA: ${clientInfo.tvaNumber}`);
  if (clientInfo?.email) details.push(clientInfo.email);
  if (clientInfo?.phone) details.push(`Tél: ${clientInfo.phone}`);
  const address = clientInfo?.companyAddress || clientInfo?.address;
  if (address) details.push(address);
  const location = [clientInfo?.postalCode, clientInfo?.city].filter(Boolean).join(' ');
  if (location) details.push(location);
  return { name, details };
}

function groupVATByRate(items: any[]): { rate: number; amount: number }[] {
  const vatMap = new Map<number, number>();
  for (const item of items) {
    const rate = parseFloat(item.taxRate || '20');
    const vat = parseFloat(item.taxAmount || '0');
    vatMap.set(rate, (vatMap.get(rate) || 0) + vat);
  }
  return Array.from(vatMap.entries())
    .map(([rate, amount]) => ({ rate, amount }))
    .sort((a, b) => a.rate - b.rate);
}

interface VehiclePDFData {
  registration?: string | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  fuelType?: string | null;
  fiscalPower?: string | null;
  firstRegDate?: string | null;
  color?: string | null;
}

interface DocumentPDFData {
  reference: string;
  date: string;
  secondaryDate?: string;
  secondaryDateLabel?: string;
  clientName: string;
  clientDetails: string[];
  vehicle?: VehiclePDFData;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceHT: number;
    taxRate: number;
    totalHT: number;
    totalTTC: number;
  }>;
  totalHT: number;
  totalTTC: number;
  vatGroups: Array<{ rate: number; amount: number }>;
  showSignature: boolean;
  fileName: string;
}

function hasVehicleData(v?: VehiclePDFData): v is VehiclePDFData {
  if (!v) return false;
  return Boolean(
    v.registration || v.make || v.model || v.vin ||
    v.fuelType || v.fiscalPower || v.firstRegDate || v.color
  );
}

function drawVehicleBlock(doc: jsPDF, v: VehiclePDFData, x: number, y: number, width: number): number {
  // Compose primary line: REG – MAKE MODEL – VIN  (sections joined by " – ")
  const primaryParts: string[] = [];
  if (v.registration) primaryParts.push(String(v.registration).toUpperCase());
  const makeModel = [v.make, v.model].filter(Boolean).join(' ').trim();
  if (makeModel) primaryParts.push(makeModel.toUpperCase());
  if (v.vin) primaryParts.push(String(v.vin).toUpperCase());
  const primaryLine = primaryParts.join(' – ');

  // Compose secondary line bullets
  const secondaryBullets: string[] = [];
  if (v.vin) secondaryBullets.push(`VIN: ${v.vin}`);
  if (v.fuelType) secondaryBullets.push(`Carburant: ${v.fuelType}`);
  if (v.fiscalPower) secondaryBullets.push(`${v.fiscalPower} CV`);
  if (v.color) secondaryBullets.push(`Couleur: ${v.color}`);
  if (v.firstRegDate) secondaryBullets.push(`1ère MEC: ${v.firstRegDate}`);
  const secondaryLine = secondaryBullets.join(' • ');

  const padding = 4;
  const titleH = 5;
  const lineH = 5;
  const innerLines = (primaryLine ? 1 : 0) + (secondaryLine ? 1 : 0);
  const boxH = padding * 2 + titleH + 2 + innerLines * lineH;

  drawRoundedRect(doc, x, y, width, boxH, 2, COLORS.lightGray, COLORS.border);

  doc.setFontSize(8).setFont('helvetica', 'bold').setTextColor(...COLORS.primary);
  doc.text('VÉHICULE', x + padding, y + padding + 3);

  let cursorY = y + padding + 3 + titleH;
  doc.setTextColor(...COLORS.dark);
  if (primaryLine) {
    doc.setFontSize(9).setFont('helvetica', 'bold');
    doc.text(primaryLine, x + padding, cursorY);
    cursorY += lineH;
  }
  if (secondaryLine) {
    doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(...COLORS.gray);
    doc.text(secondaryLine, x + padding, cursorY);
    cursorY += lineH;
  }

  doc.setTextColor(0, 0, 0);
  return y + boxH;
}

async function generateDocumentPDFCore(doc: jsPDF, data: DocumentPDFData, companyInfo: CompanyInfo) {
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;

  doc.setFontSize(14).setFont('helvetica', 'bold').setTextColor(...COLORS.dark).text(data.reference, pageWidth - margin, 22, { align: 'right' });
  doc.setFontSize(10).setFont('helvetica', 'normal').text(`Date : ${data.date}`, pageWidth - margin, 28, { align: 'right' });
  if (data.secondaryDate) {
    doc.text(`${data.secondaryDateLabel || 'Validité'} : ${data.secondaryDate}`, pageWidth - margin, 34, { align: 'right' });
  }

  const infoStartY = 45;
  const infoBoxWidth = (pageWidth - margin * 2 - 10) / 2;

  doc.setFontSize(9).setTextColor(...COLORS.gray).text('MY JANTES', margin, infoStartY + 17);
  doc.text([companyInfo.address, companyInfo.city, companyInfo.phone, companyInfo.email, companyInfo.website], margin, infoStartY + 24);

  const destX = pageWidth - margin - infoBoxWidth;
  doc.setFontSize(11).setTextColor(...COLORS.dark).text(data.clientName, destX, infoStartY + 17);
  if (data.clientDetails.length > 0) {
    doc.setFontSize(9).setTextColor(...COLORS.gray).text(data.clientDetails.slice(0, 5), destX, infoStartY + 24);
  }

  // Vehicle block (just above the items table)
  let tableStartY = infoStartY + 55;
  if (hasVehicleData(data.vehicle)) {
    const blockBottom = drawVehicleBlock(doc, data.vehicle, margin, tableStartY, pageWidth - margin * 2);
    tableStartY = blockBottom + 6;
  }

  const tableData = data.items.map((item, index) => [
    index + 1,
    item.description,
    item.quantity.toFixed(2).replace('.', ','),
    `${item.unitPriceHT.toFixed(2)} \u20AC`,
    `${item.taxRate.toFixed(0)} %`,
    `${item.totalHT.toFixed(2)} \u20AC`,
    `${item.totalTTC.toFixed(2)} \u20AC`
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['No.', 'Description', 'Qté', 'Prix unit. HT', 'TVA', 'Total HT', 'Total TTC']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 3,
      halign: 'center',
      valign: 'middle',
      lineColor: COLORS.primary,
      lineWidth: 0.1,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: COLORS.dark,
      lineColor: COLORS.border,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGray,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' }
    },
    tableLineColor: COLORS.border,
    tableLineWidth: 0.5,
  });

  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const totalsBoxWidth = 90;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  const totalsX = pageWidth - margin;

  doc.setFontSize(10).setTextColor(...COLORS.dark);
  doc.text('Total HT', totalsBoxX, finalY);
  doc.text(`${data.totalHT.toFixed(2)} \u20AC`, totalsX, finalY, { align: 'right' });

  doc.setDrawColor(...COLORS.border);
  doc.line(totalsBoxX, finalY + 3, totalsX, finalY + 3);

  let vatLineY = finalY + 10;
  for (const vat of data.vatGroups) {
    doc.text(`TVA ${vat.rate.toFixed(0)} %`, totalsBoxX, vatLineY);
    doc.text(`${vat.amount.toFixed(2)} \u20AC`, totalsX, vatLineY, { align: 'right' });
    vatLineY += 7;
  }

  doc.line(totalsBoxX, vatLineY - 4, totalsX, vatLineY - 4);

  drawRoundedRect(doc, totalsBoxX - 5, vatLineY - 1, totalsBoxWidth + 5, 14, 3, COLORS.primary);
  doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...COLORS.white);
  const totalTtcY = vatLineY + 8;
  doc.text('Total TTC', totalsBoxX + 2, totalTtcY);
  doc.text(`${data.totalTTC.toFixed(2)} \u20AC`, totalsX - 2, totalTtcY, { align: 'right' });

  doc.setTextColor(0, 0, 0);

  if (data.showSignature) {
    const signatureY = vatLineY + 28;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...COLORS.dark);
    doc.text('Date et signature du client', margin, signatureY);
    doc.text("(Précédée de la mention 'Bon pour accord')", margin, signatureY + 5);
  }

  drawPremiumFooter(doc, companyInfo, margin);
}

export async function generateQuotePDF(quote: any, clientInfo: any, service?: any, quoteItems: any[] = [], settings?: ApplicationSettings | null, returnDoc = false) {
  const companyInfo = getCompanyInfoFromSettings(settings);
  const doc = new jsPDF();
  const margin = 15;

  try {
    const logoBase64 = await getLogoBase64(companyInfo.logo);
    if (logoBase64 && logoBase64.length > 100) {
      doc.addImage(logoBase64, 'PNG', margin, 12, 50, 50 / 1.414);
    } else {
      throw new Error("Logo base64 invalid or empty");
    }
  } catch (e) {
    console.warn("Logo addImage failed, falling back to text:", e);
    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text(companyInfo.name, margin, 25);
  }

  const { name: clientName, details: clientDetails } = formatClientInfo(clientInfo);
  const defaultTaxRate = 20;

  const items = quoteItems.length > 0
    ? quoteItems.map(i => {
        const qty = parseFloat(i.quantity || '1');
        const unitPriceHT = parseFloat(i.unitPriceExcludingTax || i.unitPrice || '0');
        const totalHT = parseFloat(i.totalExcludingTax || '0') || (qty * unitPriceHT);
        const taxRate = parseFloat(i.taxRate || '20');
        const totalTTC = parseFloat(i.totalIncludingTax || '0') || (totalHT * (1 + taxRate / 100));
        return { description: i.description, quantity: qty, unitPriceHT, taxRate, totalHT, totalTTC };
      })
    : (() => {
        const amt = parseFloat(quote.priceExcludingTax || quote.quoteAmount || '0');
        const ttc = amt * (1 + defaultTaxRate / 100);
        return [{ description: service?.name || 'Prestation', quantity: 1, unitPriceHT: amt, taxRate: defaultTaxRate, totalHT: amt, totalTTC: ttc }];
      })();

  const totalHT = parseFloat(quote.priceExcludingTax || '0') || items.reduce((s, i) => s + i.totalHT, 0);
  const totalTaxAmt = parseFloat(quote.taxAmount || '0');
  const totalTTC = parseFloat(quote.quoteAmount || '0') || (totalHT + totalTaxAmt);
  const vatGroups = quoteItems.length > 0 ? groupVATByRate(quoteItems) : [{ rate: defaultTaxRate, amount: totalTaxAmt || totalHT * (defaultTaxRate / 100) }];

  await generateDocumentPDFCore(doc, {
    reference: quote.reference || quote.quoteNumber,
    date: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('fr-FR') : '',
    secondaryDate: quote.expiryDate ? new Date(quote.expiryDate).toLocaleDateString('fr-FR') : undefined,
    secondaryDateLabel: 'Validité',
    clientName,
    clientDetails,
    vehicle: {
      registration: quote.vehicleRegistration,
      make: quote.vehicleMake,
      model: quote.vehicleModel,
      vin: quote.vehicleVin,
      fuelType: quote.vehicleFuelType,
      fiscalPower: quote.vehicleFiscalPower,
      firstRegDate: quote.vehicleFirstRegDate,
      color: quote.vehicleColor,
    },
    items,
    totalHT,
    totalTTC,
    vatGroups,
    showSignature: true,
    fileName: `devis-${quote.reference || quote.quoteNumber}.pdf`,
  }, companyInfo);

  if (returnDoc) return doc;
  // doc.save is handled inside core if needed, but we keep it here for compatibility
  doc.save(`devis-${quote.reference || quote.quoteNumber}.pdf`);
}

export async function generateInvoicePDF(invoice: any, clientInfo: any, quote?: any, service?: any, invoiceItems: any[] = [], settings?: ApplicationSettings | null, returnDoc = false) {
  const companyInfo = getCompanyInfoFromSettings(settings);
  const doc = new jsPDF();
  const margin = 15;

  try {
    const logoBase64 = await getLogoBase64(companyInfo.logo);
    if (logoBase64 && logoBase64.length > 100) {
      doc.addImage(logoBase64, 'PNG', margin, 12, 50, 50 / 1.414);
    } else {
      throw new Error("Logo base64 invalid or empty");
    }
  } catch (e) {
    console.warn("Logo addImage failed, falling back to text:", e);
    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text(companyInfo.name, margin, 25);
  }

  const { name: clientName, details: clientDetails } = formatClientInfo(clientInfo);
  const defaultTaxRate = 20;

  const items = invoiceItems.length > 0
    ? invoiceItems.map(i => {
        const qty = parseFloat(i.quantity || '1');
        const unitPriceHT = parseFloat(i.unitPriceExcludingTax || '0');
        const totalHT = parseFloat(i.totalExcludingTax || '0') || (qty * unitPriceHT);
        const taxRate = parseFloat(i.taxRate || '20');
        const totalTTC = parseFloat(i.totalIncludingTax || '0') || (totalHT * (1 + taxRate / 100));
        return { description: i.description, quantity: qty, unitPriceHT, taxRate, totalHT, totalTTC };
      })
    : (() => {
        const ht = parseFloat(invoice.priceExcludingTax || '0') || parseFloat(invoice.amount || '0');
        const ttc = parseFloat(invoice.amount || '0') || (ht * (1 + defaultTaxRate / 100));
        return [{ description: invoice.productDetails || service?.name || 'Prestation', quantity: 1, unitPriceHT: ht, taxRate: defaultTaxRate, totalHT: ht, totalTTC: ttc }];
      })();

  const totalHT = parseFloat(invoice.priceExcludingTax || '0') || items.reduce((s, i) => s + i.totalHT, 0);
  const totalTaxAmt = parseFloat(invoice.taxAmount || '0');
  const totalTTC = parseFloat(invoice.amount || '0') || (totalHT + totalTaxAmt);
  const vatGroups = invoiceItems.length > 0 ? groupVATByRate(invoiceItems) : [{ rate: defaultTaxRate, amount: totalTaxAmt || totalHT * (defaultTaxRate / 100) }];

  // Vehicle info: prefer invoice's own fields, fallback to source quote
  const vSrc = invoice;
  const vQuote = quote || {};
  const pick = (a: any, b: any) => (a ?? null) || (b ?? null);

  await generateDocumentPDFCore(doc, {
    reference: invoice.invoiceNumber,
    date: invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('fr-FR') : '',
    secondaryDate: undefined,
    secondaryDateLabel: undefined,
    clientName,
    clientDetails,
    vehicle: {
      registration: pick(vSrc.vehicleRegistration, vQuote.vehicleRegistration),
      make: pick(vSrc.vehicleMake, vQuote.vehicleMake),
      model: pick(vSrc.vehicleModel, vQuote.vehicleModel),
      vin: pick(vSrc.vehicleVin, vQuote.vehicleVin),
      fuelType: pick(vSrc.vehicleFuelType, vQuote.vehicleFuelType),
      fiscalPower: pick(vSrc.vehicleFiscalPower, vQuote.vehicleFiscalPower),
      firstRegDate: pick(vSrc.vehicleFirstRegDate, vQuote.vehicleFirstRegDate),
      color: pick(vSrc.vehicleColor, vQuote.vehicleColor),
    },
    items,
    totalHT,
    totalTTC,
    vatGroups,
    showSignature: false,
    fileName: `${invoice.invoiceNumber}.pdf`,
  }, companyInfo);

  if (returnDoc) return doc;
  doc.save(`${invoice.invoiceNumber}.pdf`);
}

export async function generateDeliveryNotePDF(note: any, clientInfo: any, invoices: any[], settings?: ApplicationSettings | null) {
  const COMPANY_INFO = getCompanyInfoFromSettings(settings);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const showPrices = note.showPrices !== false;

  try {
    const logoBase64 = await getLogoBase64(COMPANY_INFO.logo);
    doc.addImage(logoBase64, 'PNG', margin, 12, 50, 50 / 1.414);
  } catch (e) {
    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text(COMPANY_INFO.name, margin, 25);
  }

  const titleBoxWidth = 85;
  const titleBoxX = pageWidth - margin - titleBoxWidth;
  drawRoundedRect(doc, titleBoxX, 12, titleBoxWidth, 28, 3, COLORS.primaryLight, COLORS.primary);
  doc.setFontSize(13).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text('BON DE LIVRAISON', titleBoxX + titleBoxWidth/2, 22, { align: 'center' });
  doc.setFontSize(11).setTextColor(...COLORS.dark).text(`N° ${note.deliveryNoteNumber}`, titleBoxX + titleBoxWidth/2, 30, { align: 'center' });

  const infoStartY = 52;
  const infoBoxWidth = (pageWidth - margin*2 - 10) / 2;
  
  doc.setFontSize(9).setTextColor(...COLORS.gray).text('MY JANTES', margin, infoStartY + 17);
  doc.text([COMPANY_INFO.address, COMPANY_INFO.city, COMPANY_INFO.phone, COMPANY_INFO.email, COMPANY_INFO.website], margin, infoStartY + 24);

  const { name: cName, details: cDetails } = formatClientInfo(clientInfo);
  const destX = pageWidth - margin - infoBoxWidth;
  doc.setFontSize(11).setTextColor(...COLORS.dark).text(cName, destX, infoStartY + 17);
  doc.setFontSize(9).setTextColor(...COLORS.gray).text(cDetails.slice(0, 5), destX, infoStartY + 24);

  const tableData: any[] = [];
  invoices.forEach(inv => {
    (inv.items || [{ description: 'Prestation', quantity: 1, unitPriceExcludingTax: inv.amount, totalExcludingTax: inv.amount }]).forEach((item: any) => {
      tableData.push([
        `${inv.invoiceNumber} - ${item.description}`,
        item.quantity || 1,
        showPrices ? `${parseFloat(item.unitPriceExcludingTax || '0').toFixed(2)} \u20AC` : '-',
        showPrices ? `${parseFloat(item.totalExcludingTax || '0').toFixed(2)} \u20AC` : '-'
      ]);
    });
  });

  autoTable(doc, {
    startY: infoStartY + 55,
    head: [['Facture / Description', 'Qté', 'Prix HT', 'Total HT']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
  });

  if (showPrices) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10).text(`Total HT: ${parseFloat(note.totalHT || '0').toFixed(2)} \u20AC`, pageWidth - margin, finalY, { align: 'right' });
    doc.text(`Total TTC: ${parseFloat(note.totalAmount || '0').toFixed(2)} \u20AC`, pageWidth - margin, finalY + 10, { align: 'right' });
  }

  doc.save(`${note.deliveryNoteNumber}.pdf`);
}

export async function generateDashboardPDF(stats: any, chartImages?: Record<string, string>, settings?: ApplicationSettings | null) {
  const COMPANY_INFO = getCompanyInfoFromSettings(settings);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;

  try {
    const logoBase64 = await getLogoBase64(COMPANY_INFO.logo);
    doc.addImage(logoBase64, 'PNG', margin, 12, 50, 50 / 1.414);
  } catch (e) {
    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text(COMPANY_INFO.name, margin, 25);
  }

  doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor(...COLORS.dark);
  doc.text('Rapport Tableau de Bord', pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(...COLORS.gray);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 32, { align: 'center' });

  // Add filter summary if available
  let currentY = 45;
  if (stats.filterApplied) {
    doc.setFontSize(9).setFont('helvetica', 'italic').setTextColor(...COLORS.gray);
    doc.text('Filtres appliqués : Période personnalisée / Services / Paiements', margin, currentY);
    currentY += 10;
  }

  const kpis = [
    ['Chiffre d\'affaires global', `${(stats.globalRevenue || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Revenus en attente', `${(stats.pendingRevenue || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Nombre de Factures', `${stats.totalInvoices || 0}`],
    ['Nombre de Devis', `${stats.totalQuotes || 0}`],
    ['Nombre de Réservations', `${stats.totalReservations || 0}`],
    ['Taux de conversion', `${stats.conversionRate || 0}%`],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Indicateur', 'Valeur']],
    body: kpis,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Add Chart Images if provided
  if (chartImages) {
    if (chartImages.revenue) {
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...COLORS.dark).text('Évolution des Revenus', margin, currentY);
      doc.addImage(chartImages.revenue, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
      currentY += 95;
    }

    if (chartImages.service) {
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...COLORS.dark).text('Répartition par Service', margin, currentY);
      doc.addImage(chartImages.service, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
      currentY += 95;
    }

    if (chartImages.method) {
      if (currentY > 220) { doc.addPage(); currentY = 20; }
      doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...COLORS.dark).text('Modes de Paiement', margin, currentY);
      doc.addImage(chartImages.method, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
    }
  }

  drawPremiumFooter(doc, COMPANY_INFO, margin);
  doc.save(`rapport-dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
}

export async function generateAdvancedAnalyticsPDF(stats: any, chartImages: Record<string, string>, settings?: ApplicationSettings | null) {
  const COMPANY_INFO = getCompanyInfoFromSettings(settings);
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;

  try {
    const logoBase64 = await getLogoBase64(COMPANY_INFO.logo);
    doc.addImage(logoBase64, 'PNG', margin, 12, 50, 50 / 1.414);
  } catch (e) {
    doc.setFontSize(20).setFont('helvetica', 'bold').setTextColor(...COLORS.primary).text(COMPANY_INFO.name, margin, 25);
  }

  doc.setFontSize(16).setFont('helvetica', 'bold').setTextColor(...COLORS.dark);
  doc.text('Analyses Avancées & Tendances', pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(10).setFont('helvetica', 'normal').setTextColor(...COLORS.gray);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 32, { align: 'center' });

  let currentY = 45;
  const s = stats.summary;
  
  const kpis = [
    ['Chiffre d\'affaires Total', `${(s.totalRevenue || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Montant Encaissé', `${(s.paidAmount || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Montant en Attente', `${(s.pendingAmount || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Ticket Moyen', `${(s.avgTicket || 0).toLocaleString('fr-FR')} \u20AC`],
    ['Clients Actifs', `${s.totalActiveClients || 0}`],
    ['Taux de Rétention', `${stats.retentionRate || 0}%`],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Indicateur de Performance', 'Valeur']],
    body: kpis,
    theme: 'grid',
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white },
    styles: { fontSize: 9 },
    margin: { left: margin, right: margin }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Charts
  if (chartImages.services) {
    doc.setFontSize(11).setFont('helvetica', 'bold').text('Évolution des Services', margin, currentY);
    doc.addImage(chartImages.services, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
    currentY += 95;
  }

  if (chartImages.financial) {
    if (currentY > 220) { doc.addPage(); currentY = 20; }
    doc.setFontSize(11).setFont('helvetica', 'bold').text('Flux de Trésorerie', margin, currentY);
    doc.addImage(chartImages.financial, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
    currentY += 95;
  }

  if (chartImages.performance) {
    if (currentY > 220) { doc.addPage(); currentY = 20; }
    doc.setFontSize(11).setFont('helvetica', 'bold').text('Performance du Tunnel de Conversion', margin, currentY);
    doc.addImage(chartImages.performance, 'PNG', margin, currentY + 5, pageWidth - margin * 2, 80);
  }

  drawPremiumFooter(doc, COMPANY_INFO, margin);
  doc.save(`analyses-avancees-${new Date().toISOString().split('T')[0]}.pdf`);
}

const POSITION_MAP_PDF: Record<string, { pos: string; name: string }> = {
  FL: { pos: 'AVG', name: 'AVANT GAUCHE' },
  FR: { pos: 'AVD', name: 'AVANT DROITE' },
  RL: { pos: 'ARG', name: 'ARRIÈRE GAUCHE' },
  RR: { pos: 'ARD', name: 'ARRIÈRE DROITE' },
};

export async function generateLabelsPDF(entity: any, type: 'invoice' | 'quote') {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [100, 150]
  });

  const reference = entity.invoiceNumber || entity.reference || entity.quoteNumber || entity.id.slice(0, 8);
  const date = entity.createdAt ? new Date(entity.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
  
  const pageWidth = doc.internal.pageSize.width;   // 150
  const pageHeight = doc.internal.pageSize.height;  // 100

  let wheelLabels: { pos: string; name: string }[] = [];
  const wp = entity.wheelPositions as string[] | null | undefined;
  if (wp && Array.isArray(wp) && wp.length > 0) {
    wheelLabels = wp.map(p => POSITION_MAP_PDF[p]).filter(Boolean);
  } else {
    wheelLabels = [
      { pos: 'AVG', name: 'AVANT GAUCHE' },
      { pos: 'AVD', name: 'AVANT DROITE' },
      { pos: 'ARG', name: 'ARRIÈRE GAUCHE' },
      { pos: 'ARD', name: 'ARRIÈRE DROITE' },
    ];
  }
  
  const positions = [
    ...wheelLabels,
    { pos: 'CLÉ', name: 'CLÉ VÉHICULE' }
  ];

  const cols = 3;
  const rows = 2;
  const margin = 5;
  const gapX = 3;
  const gapY = 3;
  const cellW = (pageWidth - margin * 2 - gapX * (cols - 1)) / cols;
  const cellH = (pageHeight - margin * 2 - gapY * (rows - 1)) / rows;

  const maxLabels = Math.min(positions.length, cols * rows);
  for (let i = 0; i < maxLabels; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cellW + gapX);
    const y = margin + row * (cellH + gapY);

    const label = positions[i];

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cellW, cellH, 2, 2);

    try {
      const qrData = `${reference}-${label.pos}`;
      const qrSize = 22;
      const qrX = x + (cellW - qrSize) / 2;
      const qrY = y + 3;
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });
      doc.addImage(qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
    } catch (e) {
      console.error('QR generation error', e);
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text("MY JANTES", x + cellW / 2, y + 28, { align: 'center' });

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref: ${reference}`, x + cellW / 2, y + 32, { align: 'center' });
    doc.text(`${date}`, x + cellW / 2, y + 35.5, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text(label.pos, x + cellW / 2, y + 42, { align: 'center' });
    
    doc.setFontSize(5.5);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text(label.name, x + cellW / 2, y + 46, { align: 'center' });
  }

  doc.save(`etiquettes-${reference}.pdf`);
}
