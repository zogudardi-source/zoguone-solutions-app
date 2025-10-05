import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Re-define the ReportData interface here to avoid circular dependencies
// This is a simplified version for the export function's type safety.
interface ReportData {
    kpis: {
        newCustomers: number;
        avgInvoiceValue: number;
        quoteConversionRate: number;
    };
    profitLoss: {
        revenue: number;
        expenses: number;
        profit: number;
    };
    salesByCustomer: { customerName: string; totalSales: number }[];
    taxSummary: {
        collected: number;
    };
    topSellingProducts: { productName: string; totalQuantity: number; totalRevenue: number }[];
    teamPerformance: { employeeName: string; totalRevenue: number; completedVisits: number }[];
}


// Helper function to convert an array of objects to a CSV string.
const jsonToCsv = (items: any[]): string => {
    if (items.length === 0) return '';
    const header = Object.keys(items[0]);
    const headerString = header.join(',');
    const rows = items.map(row => 
        header.map(fieldName => JSON.stringify(row[fieldName], (_, value) => value === null ? '' : value)).join(',')
    );
    return [headerString, ...rows].join('\r\n');
};

/**
 * Triggers a browser download for a CSV file.
 * @param data The array of objects to convert to CSV.
 * @param filename The desired name for the downloaded file.
 */
export const downloadCsv = (data: any[], filename: string) => {
    if (data.length === 0) {
        alert("No data available to export.");
        return;
    }
    const csvData = jsonToCsv(data);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Generates a summary PDF from the report data and triggers a download.
 * @param reportData The fully processed report data object.
 * @param orgName The name of the organization for the report header.
 * @param dateRange An object containing the formatted start and end dates.
 */
export const generateReportPdf = (reportData: ReportData, orgName: string, dateRange: { start: string, end: string }) => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = margin;

    // Header
    doc.setFontSize(22).setFont(undefined, 'bold');
    doc.text('Business Report', margin, y);
    y += 8;
    doc.setFontSize(12).setFont(undefined, 'normal');
    doc.text(`${orgName}`, margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.text(`Period: ${dateRange.start} - ${dateRange.end}`, margin, y);
    y += 15;

    // KPIs
    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text('Key Performance Indicators', margin, y);
    y += 7;
    doc.setFontSize(10).setFont(undefined, 'normal');
    doc.text(`- New Customers: ${reportData.kpis.newCustomers}`, margin, y);
    doc.text(`- Avg. Invoice Value: €${reportData.kpis.avgInvoiceValue.toFixed(2)}`, margin + 60, y);
    y += 6;
    doc.text(`- Quote Conversion Rate: ${reportData.kpis.quoteConversionRate.toFixed(1)}%`, margin, y);
    y += 12;

    // Profit & Loss
    doc.setFontSize(12).setFont(undefined, 'bold');
    doc.text('Profit & Loss Summary', margin, y);
    y += 7;
    doc.setFontSize(10);
    autoTable(doc, {
        startY: y,
        theme: 'plain',
        body: [
            ['Total Revenue', `€${reportData.profitLoss.revenue.toFixed(2)}`],
            ['Total Expenses', `- €${reportData.profitLoss.expenses.toFixed(2)}`],
            ['Net Profit', `€${reportData.profitLoss.profit.toFixed(2)}`],
        ],
        bodyStyles: { fontStyle: 'bold', cellPadding: 2 },
        columnStyles: { 1: { halign: 'right' } }
    });
    y = (doc as any).lastAutoTable.finalY + 12;

    // Sales by Customer
    if (reportData.salesByCustomer.length > 0) {
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text('Top Sales by Customer', margin, y);
        y += 7;
        autoTable(doc, {
            startY: y,
            head: [['Customer', 'Total Sales']],
            body: reportData.salesByCustomer
                .sort((a, b) => b.totalSales - a.totalSales)
                .slice(0, 10) // Limit to top 10 for PDF
                .map(item => [item.customerName, `€${item.totalSales.toFixed(2)}`]),
            headStyles: { fillColor: [47, 55, 69] },
            columnStyles: { 1: { halign: 'right' } }
        });
        y = (doc as any).lastAutoTable.finalY + 12;
    }
    
    doc.save(`Report_${orgName}_${dateRange.start}_${dateRange.end}.pdf`);
};
