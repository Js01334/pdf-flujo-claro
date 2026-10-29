import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FileText, FolderOpen, LoaderCircle, PackageCheck, ShieldCheck } from "lucide-react";
import * as XLSX from "xlsx";
import JSZip from "jszip";

type PdfInput = File & { webkitRelativePath?: string };
type ProcessResult = { original: string; renamed?: string; status: "matched" | "not-found" | "skipped" | "empty-cell"; detail: string };

const cleanCell = (value: unknown) => String(value ?? "").trim();
const cleanSuffix = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "");
const safeName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/[. ]+$/g, "") || "PDF";

const PdfExcelProcessor = () => {
  const folderRef = useRef<HTMLInputElement>(null);
  useEffect(() => { folderRef.current?.setAttribute("webkitdirectory", ""); }, []);
  const [pdfs, setPdfs] = useState<PdfInput[]>([]);
  const [excel, setExcel] = useState<File | null>(null);
  const [results, setResults] = useState<ProcessResult[]>([]);
  const [zipUrl, setZipUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const matchedCount = useMemo(() => results.filter(item => item.status === "matched").length, [results]);
  const notFoundCount = useMemo(() => results.filter(item => item.status === "not-found").length, [results]);

  const selectFolder = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []) as PdfInput[];
    setPdfs(selected.filter(file => file.name.toLowerCase().endsWith(".pdf")));
    setResults([]);
    setError("");
    setZipUrl("");
  };

  const selectExcel = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setExcel(selected);
    setResults([]);
    setError("");
    setZipUrl("");
  };

  const process = async () => {
    if (!pdfs.length || !excel || busy) return;
    setBusy(true);
    setProgress(0);
    setResults([]);
    setError("");
    setZipUrl("");
    setStatus("Leyendo el libro de Excel…");
    try {
      const workbook = XLSX.read(await excel.arrayBuffer(), { type: "array", cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("El archivo de Excel no contiene hojas con datos.");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false, defval: "", blankrows: false });
      if (!rows.length) throw new Error("La primera hoja del archivo está vacía.");
      const dataRows = rows.map(row => Array.from({ length: Math.max(5, row.length) }, (_, index) => cleanCell(row[index]))).filter(row => row.slice(0, 5).some(Boolean));
      const zip = new JSZip();
      const nextResults: ProcessResult[] = [];
      for (let index = 0; index < pdfs.length; index++) {
        const pdf = pdfs[index];
        setStatus(`Procesando ${pdf.name} (${index + 1} de ${pdfs.length})…`);
        const stem = pdf.name.replace(/\.pdf$/i, "");
        const parts = stem.trim().split(/\s+/).filter(Boolean);
        const first = parts[0]?.trim() ?? "";
        const last = parts.length > 1 ? parts[parts.length - 1].trim() : "";
        const match = parts.length > 1 ? dataRows.find(row => row[0] === first && row[1] === last) : undefined;
        const rawSuffix = match ? cleanSuffix(match[4]) : "";
        const emptyFifthCell = Boolean(match && !rawSuffix);
        const suffix = match && !emptyFifthCell ? rawSuffix : "NE";
        const newName = `${safeName(stem)} - ${safeName(suffix)}.pdf`;
        const relativePath = pdf.webkitRelativePath || pdf.name;
        const relativeDirectory = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/") + 1) : "";
        zip.file(`${relativeDirectory}${newName}`, pdf);
        const resultStatus = emptyFifthCell ? "empty-cell" : match ? "matched" : "not-found";
        const detail = emptyFifthCell ? "Coincidencia exacta, pero la columna 5 está vacía; se anexó NE." : match ? `Coincidencia exacta; se anexó: ${suffix}` : "Sin coincidencia exacta o datos insuficientes; se anexó NE.";
        nextResults.push({ original: relativePath, renamed: `${relativeDirectory}${newName}`, status: resultStatus, detail });
        setProgress(Math.round((index + 1) / pdfs.length * 100));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (!nextResults.some(item => item.renamed)) throw new Error("No se pudo agregar ningún PDF al ZIP. Revisa los nombres y los datos de Excel.");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      setZipUrl(url);
      setResults(nextResults);
      setStatus("Proceso terminado. Descarga el ZIP para obtener los archivos renombrados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron procesar los archivos.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-2xl border border-[#dfe7dc] bg-white p-6 shadow-sm md:p-7">
    <div className="mb-6 flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf4e4] text-[#3e8b23]"><PackageCheck size={20}/></div><div><h2 className="text-xl font-extrabold">Procesar con carpeta + Excel</h2><p className="mt-1 text-sm leading-6 text-slate-600">Carga tus PDF y el libro con los registros. La página compara columnas 1 y 2, agrega la columna 5 o NE y prepara un ZIP descargable.</p></div></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex min-h-40 cursor-pointer flex-col justify-between rounded-2xl border-2 border-dashed border-[#cbdcc3] bg-[#f8fbf6] p-5 transition hover:border-[#3e8b23] hover:bg-[#f2f8ee]">
        <div className="flex items-center justify-between"><FolderOpen className="text-[#3e8b23]" size={22}/><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#36751f]">{pdfs.length} PDF</span></div>
        <div><span className="block font-extrabold">Seleccionar carpeta de PDF</span><span className="mt-1 block text-xs text-slate-500">Elige la carpeta completa; se incluyen subcarpetas.</span></div>
        <input ref={folderRef} type="file" multiple accept=".pdf,application/pdf" onChange={selectFolder} className="sr-only" />
      </label>
      <label className="flex min-h-40 cursor-pointer flex-col justify-between rounded-2xl border-2 border-dashed border-[#cbdcc3] bg-[#f8fbf6] p-5 transition hover:border-[#3e8b23] hover:bg-[#f2f8ee]">
        <div className="flex items-center justify-between"><FileSpreadsheet className="text-[#3e8b23]" size={22}/><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#36751f]">XLSX · XLS · CSV</span></div>
        <div><span className="block font-extrabold">Seleccionar archivo de Excel</span><span className="mt-1 block truncate text-xs text-slate-500">{excel?.name ?? "Usa la primera hoja del libro."}</span></div>
        <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={selectExcel} className="sr-only" />
      </label>
    </div>
    <div className="mt-5 rounded-xl bg-[#f4f7f1] p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mr-2 inline text-[#3e8b23]" size={17}/><b>Formato esperado en la primera hoja:</b> columnas 1 (dato de oficio), 2 (expediente) y 5 (texto a agregar). Se comparan los dos primeros datos del nombre sin cambiar mayúsculas, signos ni formato, salvo espacios exteriores.</div>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={process} disabled={!pdfs.length || !excel || busy} className="inline-flex items-center gap-2 rounded-xl bg-[#3e8b23] px-5 py-3 font-bold text-white transition hover:bg-[#32721c] disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="animate-spin" size={17}/> : <PackageCheck size={17}/>} {busy ? "Procesando…" : "Procesar archivos"}</button>{zipUrl&&<a href={zipUrl} download="PDF_renombrados.zip" className="inline-flex items-center gap-2 rounded-xl border border-[#cddbc6] bg-white px-5 py-3 font-bold text-[#36751f] hover:bg-[#f5f9f2]"><Download size={17}/>Descargar ZIP</a>}</div>
    {busy&&<div className="mt-5"><div className="mb-2 flex justify-between text-xs text-slate-600"><span>{status}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#3e8b23] transition-all" style={{ width: `${progress}%` }}/></div></div>}
    {!busy&&status&&<p className="mt-4 text-sm text-slate-600">{status}</p>}
    {error&&<div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="shrink-0" size={18}/>{error}</div>}
    {results.length>0&&<div className="mt-6"><div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><span className="font-bold">Resultado</span><span className="text-[#36751f]">{matchedCount} con coincidencia</span><span className="text-amber-700">{notFoundCount} con NE</span><span className="text-slate-500">{results.filter(item=>item.status==='skipped'||item.status==='empty-cell').length} omitidos</span></div><div className="max-h-72 overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[540px] border-collapse text-left text-xs"><thead className="sticky top-0 bg-[#f3f6f1] text-slate-600"><tr><th className="p-3">Archivo de entrada</th><th className="p-3">Resultado</th><th className="p-3">Estado</th></tr></thead><tbody>{results.map((item,index)=><tr key={`${item.original}-${index}`} className="border-t border-slate-100"><td className="max-w-[220px] truncate p-3" title={item.original}>{item.original}</td><td className="max-w-[240px] truncate p-3" title={item.renamed||item.detail}>{item.renamed||item.detail}</td><td className="p-3">{item.status==='matched'?<span className="inline-flex items-center gap-1 text-[#36751f]"><CheckCircle2 size={14}/>Coincidencia</span>:item.status==='not-found'?<span className="text-amber-700">NE</span>:<span className="text-slate-500">Omitido</span>}</td></tr>)}</tbody></table></div></div>}
    <p className="mt-4 text-xs leading-5 text-slate-500">Los originales no se modifican: se genera una copia renombrada dentro del ZIP. Todo el procesamiento ocurre en tu navegador; el contenido de los documentos no se envía a un servidor.</p>
  </section>;
};

export default PdfExcelProcessor;
