using System.IO.Compression;
using System.Text;
using ClosedXML.Excel;
using DxFlow.Web.Models;

namespace DxFlow.Web.Services;

/// <summary>
/// Builds CSV/Excel downloads in memory — port of
/// <c>backend/services/export_service.py</c>. Nothing is written to the
/// server filesystem; the browser receives an attachment stream.
/// </summary>
public static class ExportService
{
    private static string SafeFilenamePart(string? text)
    {
        var cleaned = new string((text ?? string.Empty).Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-').ToArray());
        return string.IsNullOrEmpty(cleaned) ? "export" : cleaned;
    }

    /// <summary>
    /// Strips directory segments from the node's optional path field so a saved
    /// flow cannot steer downloads toward arbitrary server paths.
    /// </summary>
    private static string DownloadBasename(string? filepath, string nodeId, string extension)
    {
        var raw = (filepath ?? string.Empty).Trim();
        if (!string.IsNullOrEmpty(raw))
        {
            var name = Path.GetFileName(raw);
            if (!name.EndsWith(extension, StringComparison.OrdinalIgnoreCase))
            {
                name += extension;
            }

            var stem = Path.GetFileNameWithoutExtension(name);
            return $"{SafeFilenamePart(stem)}{extension}";
        }

        return $"{SafeFilenamePart(nodeId)}{extension}";
    }

    private static string InsertSuffix(string path, string suffix)
    {
        var stem = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        return $"{stem}_{SafeFilenamePart(suffix)}{ext}";
    }

    public static byte[] RenderCsvBytes(ExportTable table)
    {
        var buffer = new StringBuilder();
        buffer.AppendLine(string.Join(",", table.Columns.Select(EscapeCsvCell)));
        foreach (var row in table.Rows)
        {
            buffer.AppendLine(string.Join(",", row.Select(cell => EscapeCsvCell(cell?.ToString() ?? string.Empty))));
        }

        return Encoding.UTF8.GetBytes(buffer.ToString());
    }

    private static string EscapeCsvCell(string value)
    {
        if (value.Contains('"') || value.Contains(',') || value.Contains('\n'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        return value;
    }

    public static byte[] RenderExcelBytes(IReadOnlyList<ExportTable> tables)
    {
        using var workbook = new XLWorkbook();
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var table in tables)
        {
            var sheetName = SheetName(table.Name, usedNames);
            var sheet = workbook.Worksheets.Add(sheetName);
            for (var col = 0; col < table.Columns.Count; col++)
            {
                sheet.Cell(1, col + 1).Value = table.Columns[col];
            }

            for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++)
            {
                var row = table.Rows[rowIndex];
                for (var col = 0; col < row.Count; col++)
                {
                    sheet.Cell(rowIndex + 2, col + 1).Value = row[col]?.ToString();
                }
            }
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string SheetName(string? name, ISet<string> usedNames)
    {
        var cleaned = new string((name ?? "Sheet").Where(ch => !"[]:*?/\\".Contains(ch)).ToArray());
        cleaned = cleaned.Length > 31 ? cleaned[..31] : cleaned;
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            cleaned = "Sheet";
        }

        var candidate = cleaned;
        var index = 2;
        while (usedNames.Contains(candidate))
        {
            candidate = $"{cleaned[..Math.Min(cleaned.Length, 28)]}_{index}";
            index++;
        }

        usedNames.Add(candidate);
        return candidate;
    }

    public static (byte[] Body, string Filename, string MimeType) BuildCsvDownload(
        IReadOnlyList<ExportTable> tables,
        string? filepath,
        string nodeId)
    {
        if (tables.Count == 0)
        {
            throw new ArgumentException("no_rows");
        }

        var basename = DownloadBasename(filepath, nodeId, ".csv");
        if (tables.Count == 1)
        {
            return (RenderCsvBytes(tables[0]), basename, "text/csv; charset=utf-8");
        }

        using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var table in tables)
            {
                var entryName = InsertSuffix(basename, table.Name ?? "table");
                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                var bytes = RenderCsvBytes(table);
                entryStream.Write(bytes, 0, bytes.Length);
            }
        }

        var zipName = $"{Path.GetFileNameWithoutExtension(basename)}.zip";
        return (zipStream.ToArray(), zipName, "application/zip");
    }

    public static (byte[] Body, string Filename, string MimeType) BuildExcelDownload(
        IReadOnlyList<ExportTable> tables,
        string? filepath,
        string nodeId)
    {
        if (tables.Count == 0)
        {
            throw new ArgumentException("no_rows");
        }

        var basename = DownloadBasename(filepath, nodeId, ".xlsx");
        return (
            RenderExcelBytes(tables),
            basename,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
}
