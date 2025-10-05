import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../services/supabase";
import { Invoice, Quote, Organization, Customer, InvoiceItem, QuoteItem } from "../types";
import { translations } from "../constants";
import { format } from 'date-fns';

type DocumentData = (Invoice | Quote) & {
    organizations: Organization | null;
    customers: Customer | null;
    invoice_items?: InvoiceItem[];
    quote_items?: QuoteItem[];
};

type Language = 'de' | 'al';

// A helper function to fetch the data, since it's almost identical for invoices and quotes
const fetchDocumentData = async (id: number, type: 'invoice' | 'quote'): Promise<DocumentData | null> => {
  const table = type === 'invoice' ? 'invoices' : 'quotes';
  const itemsTable = type === 'invoice' ? 'invoice_items' : 'quote_items';

  const { data: dataArray, error } = await supabase
    .from(table)
    .select(`
      *,
      customers:customers!left(*),
      organizations:organizations!left(*),
      ${itemsTable}:${itemsTable}!left(*)
    `)
    .eq('id', id)
    .limit(1);
    
  const data = dataArray?.[0] ?? null;

  if (error) {
    console.error(`Error fetching ${type}:`, error.message);
    throw new Error(`Could not fetch ${type} data.`);
  }

  // With aliased joins, the data is nested under the alias name. We need to rename them back.
  if (data) {
    (data as any).invoice_items = (data as any).invoice_items || (data as any)[itemsTable];
    (data as any).quote_items = (data as any).quote_items || (data as any)[itemsTable];
  }

  return data as DocumentData;
};

// Main function to generate the PDF
const generateDocumentPDF = async (
  documentId: number,
  type: 'invoice' | 'quote',
  language: Language,
  action: 'download' | 'blob' = 'download'
): Promise<Blob | void> => {
  try {
    const docData = await fetchDocumentData(documentId, type);
    if (!docData || !docData.organizations || !docData.customers) {
      alert("Missing data to generate PDF.");
      return;
    }

    const t = translations[language];
    const organization = docData.organizations;
    const customer = docData.customers;
    const items = type === 'invoice' ? docData.invoice_items : docData.quote_items;

    if (!items) {
      alert("Document has no items to generate PDF.");
      return;
    }

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // --- 1. HEADER ---
    // Add Logo
    if (organization.logo_url) {
      try {
        const response = await fetch(organization.logo_url);
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise<void>(resolve => {
            reader.onloadend = () => {
                try {
                    const base64data = reader.result as string;
                    doc.addImage(base64data, 'PNG', margin, margin, 30, 0); // Auto-height
                } catch (e) { console.error("Error adding image:", (e as Error).message); }
                finally { resolve(); }
            };
            reader.readAsDataURL(blob);
        });
      } catch (e) { console.error("Error fetching logo:", (e as Error).message); }
    }

    // Add Company Letterhead (Top Right)
    doc.setFontSize(10).setFont(undefined, 'bold');
    doc.text(organization.company_name || organization.name, pageWidth - margin, margin + 5, { align: 'right' });
    doc.setFont(undefined, 'normal');
    const companyAddressLines = doc.splitTextToSize(organization.address || '', 60);
    doc.text(companyAddressLines, pageWidth - margin, margin + 10, { align: 'right' });

    // --- 2. SENDER LINE & CUSTOMER ADDRESS ---
    doc.setFontSize(8);
    const senderLine = `${organization.company_name || organization.name} • ${organization.address || ''}`;
    doc.text(senderLine, margin, 55);
    
    doc.setFontSize(10);
    doc.text('Bill To:', margin, 65);
    doc.setFont(undefined, 'bold');
    doc.text(customer.name, margin, 70);
    doc.setFont(undefined, 'normal');
    const customerAddressLines = doc.splitTextToSize(customer.address || '', 80);
    doc.text(customerAddressLines, margin, 75);

    // --- 3. DOCUMENT DETAILS ---
    const docNumber = type === 'invoice' ? (docData as Invoice).invoice_number : (docData as Quote).quote_number;
    const issueDate = format(new Date(docData.issue_date), 'dd.MM.yyyy');
    const dueDateLabel = type === 'invoice' ? 'Fällig am:' : 'Gültig bis:';
    const dueDateValue = type === 'invoice' ? (docData as Invoice).due_date : (docData as Quote).valid_until_date;
    const dueDate = dueDateValue ? format(new Date(dueDateValue), 'dd.MM.yyyy') : '';

    const detailX = 140;
    doc.text(type === 'invoice' ? 'Rechnungsnummer:' : 'Angebotsnummer:', detailX, 65);
    doc.text('Datum:', detailX, 70);
    doc.text(dueDateLabel, detailX, 75);

    doc.text(docNumber, pageWidth - margin, 65, { align: 'right' });
    doc.text(issueDate, pageWidth - margin, 70, { align: 'right' });
    doc.text(dueDate, pageWidth - margin, 75, { align: 'right' });


    // --- 4. TITLE ---
    const title = type === 'invoice' ? 'RECHNUNG' : 'ANGEBOT';
    doc.setFontSize(22).setFont(undefined, 'bold');
    doc.text(title, margin, 100);

    // --- 5. ITEMS TABLE ---
    const tableColumn = ["Pos.", "Beschreibung", "Menge", "Preis/Einheit", "MwSt.", "Gesamt"];
    const tableRows: any[] = [];
    let subtotal = 0;
    const vatTotals: { [key: number]: number } = {};

    items.forEach((item, index) => {
      const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
      subtotal += itemTotal;
      const vatRate = item.vat_rate || 0;
      const vatAmount = itemTotal * (vatRate / 100);
      vatTotals[vatRate] = (vatTotals[vatRate] || 0) + vatAmount;

      const row = [
        index + 1,
        item.description,
        item.quantity,
        `€${(item.unit_price || 0).toFixed(2)}`,
        `${item.vat_rate}%`,
        `€${(itemTotal + vatAmount).toFixed(2)}`,
      ];
      tableRows.push(row);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 110,
      theme: 'striped',
      headStyles: { fillColor: [29, 78, 216] }, // primary-700 blue
      columnStyles: {
        0: { cellWidth: 10 },
        2: { halign: 'right', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 15 },
        5: { halign: 'right', cellWidth: 25 },
      }
    });

    // --- 6. TOTALS ---
    const finalY = (doc as any).lastAutoTable.finalY;
    let currentY = finalY + 10;
    
    doc.setFontSize(10).setFont(undefined, 'normal');
    const totalsXLabel = 150;
    const totalsXValue = pageWidth - margin;

    doc.text(`Zwischensumme (Netto):`, totalsXLabel, currentY, { align: 'right' });
    doc.text(`€${subtotal.toFixed(2)}`, totalsXValue, currentY, { align: 'right' });
    currentY += 7;

    Object.entries(vatTotals).forEach(([rate, amount]) => {
      doc.text(`zzgl. MwSt. (${rate}%):`, totalsXLabel, currentY, { align: 'right' });
      doc.text(`€${amount.toFixed(2)}`, totalsXValue, currentY, { align: 'right' });
      currentY += 7;
    });
    
    doc.line(totalsXLabel - 25, currentY - 3, totalsXValue, currentY - 3);

    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text(`Gesamtbetrag:`, totalsXLabel, currentY + 2, { align: 'right' });
    doc.text(`€${docData.total_amount.toFixed(2)}`, totalsXValue, currentY + 2, { align: 'right' });

    // --- 7. NOTES ---
    if (docData.notes) {
        let notesY = finalY + 10;
        doc.setFontSize(10).setFont(undefined, 'bold').text('Anmerkungen:', margin, notesY);
        doc.setFont(undefined, 'normal');
        const notesLines = doc.splitTextToSize(docData.notes, 100);
        doc.text(notesLines, margin, notesY + 5);
    }
    
    // --- 8. FOOTER ---
    const footerY = pageHeight - 30;
    doc.line(margin, footerY, pageWidth - margin, footerY); // Horizontal line
    doc.setFontSize(8).setFont(undefined, 'normal');
    
    let footerLine1 = organization.company_name || '';
    if(organization.address) footerLine1 += ` | ${organization.address}`;
    doc.text(footerLine1, pageWidth / 2, footerY + 8, { align: 'center' });

    let footerLine2 = '';
    if (organization.phone) footerLine2 += `Tel: ${organization.phone} | `;
    if (organization.email) footerLine2 += `Email: ${organization.email}`;
    if(footerLine2.endsWith(' | ')) footerLine2 = footerLine2.slice(0, -3);
    doc.text(footerLine2, pageWidth / 2, footerY + 12, { align: 'center' });

    let footerLine3 = '';
    if(organization.iban) footerLine3 += `IBAN: ${organization.iban} | `;
    if(organization.bic) footerLine3 += `BIC: ${organization.bic} | `;
    if(organization.ust_idnr) footerLine3 += `USt-IdNr: ${organization.ust_idnr}`;
    if(footerLine3.endsWith(' | ')) footerLine3 = footerLine3.slice(0, -3);
    doc.text(footerLine3, pageWidth / 2, footerY + 16, { align: 'center' });


    // --- 9. ACTION ---
    if (action === 'download') {
      doc.save(`${title}_${docNumber}.pdf`);
    } else {
      return doc.output('blob');
    }

  } catch (error) {
    console.error(`Failed to generate PDF for ${type} #${documentId}`, (error as Error).message);
    alert(`Could not generate the PDF. Please check the console for details.`);
  }
};

export default generateDocumentPDF;