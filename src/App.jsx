import React, { useState } from 'react';
import { Upload, FileText, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- KONFIGURASI WORKER ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function App() {
  // --- STATE DATA ---
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  
  // --- STATE SETTINGS ---
  const [dpi, setDpi] = useState(300);
  const [format, setFormat] = useState('png');
  const [pageRange, setPageRange] = useState(''); // NEW: State untuk input range
  
  // --- STATE PROSES ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Menunggu File...');

  // --- LOGIC CONSTANTS ---
  const MAX_FILE_SIZE_MB = 50; 
  const MAX_PAGES_WARNING = 100;

  // --- 1. LOGIC PARSER (THE BRAIN) ---
  // Fungsi untuk mengubah string "1, 3-5" menjadi array [1, 3, 4, 5]
  const getSelectedPages = () => {
    if (!pdfFile || numPages === 0) return [];
    
    // Jika range kosong, ambil semua halaman
    if (!pageRange.trim()) {
        return Array.from({ length: numPages }, (_, i) => i + 1);
    }

    const pages = new Set(); // Pakai Set biar tidak ada duplikat
    const parts = pageRange.split(',');

    parts.forEach(part => {
        const p = part.trim();
        if (p.includes('-')) {
            // Handle Range (misal 3-5)
            const [start, end] = p.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
                const min = Math.max(1, Math.min(start, end)); // Minimal hal 1
                const max = Math.min(numPages, Math.max(start, end)); // Maksimal hal terakhir
                for (let i = min; i <= max; i++) pages.add(i);
            }
        } else {
            // Handle Single Number (misal 1)
            const num = Number(p);
            if (!isNaN(num) && num >= 1 && num <= numPages) {
                pages.add(num);
            }
        }
    });

    // Urutkan halaman dari kecil ke besar
    return Array.from(pages).sort((a, b) => a - b);
  };

  // --- 2. HANDLER UPLOAD ---
  const handleFileChange = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert("Format salah! Mohon upload file PDF.");
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      alert(`File terlalu besar (${fileSizeMB.toFixed(1)} MB).`);
      return;
    }
    
    setPdfFile(file);
    setPageRange(''); // Reset range saat ganti file
    setProgress(0);
    setIsProcessing(false);
    setStatusText("Menganalisis PDF...");
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument(arrayBuffer);
      
      loadingTask.promise.then((pdf) => {
        setNumPages(pdf.numPages);
        setStatusText(`Siap convert ${pdf.numPages} halaman.`);
      }).catch((err) => {
        if (err.name === 'PasswordException') {
            alert("PDF Terpassword. Mohon buka kunci dulu.");
            setPdfFile(null);
        } else {
            console.error(err);
            alert("Gagal membaca PDF.");
            setPdfFile(null);
        }
      });

    } catch (error) {
      console.error(error);
      setPdfFile(null);
    }
  };

  const handleDrop = (e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => e.preventDefault();

  // --- 3. LOGIC CONVERT (SMART ENGINE) ---
  const startConversion = async () => {
    const pagesToConvert = getSelectedPages();
    
    if (!pdfFile || pagesToConvert.length === 0) {
        alert("Tidak ada halaman valid untuk diconvert!");
        return;
    }
    
    setIsProcessing(true);
    setProgress(0);
    
    const zip = new JSZip();
    // Variabel untuk menyimpan single blob jika output cuma 1 halaman
    let singleBlob = null; 
    let singleFileName = "";
    
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const scale = dpi / 72;

      // Optimasi Canvas Recycling
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      // Loop hanya pada halaman yang dipilih
      for (let i = 0; i < pagesToConvert.length; i++) {
        const pageNum = pagesToConvert[i];
        setStatusText(`Memproses Halaman ${pageNum}...`);
        
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, `image/${format}`, 0.9);
        });

        const fileName = `${pdfFile.name.replace('.pdf', '')}_pg${String(pageNum).padStart(3, '0')}.${format}`;

        if (pagesToConvert.length === 1) {
            // Jika cuma 1 halaman, simpan di variabel khusus
            singleBlob = blob;
            singleFileName = fileName;
        } else {
            // Jika banyak, masukkan ZIP
            zip.file(fileName, blob);
        }

        setProgress(Math.round(((i + 1) / pagesToConvert.length) * 100));
        await new Promise(r => setTimeout(r, 50));
      }

      // Cleanup
      canvas.width = 0; canvas.height = 0;

      // --- LOGIC FINAL: DECIDE DOWNLOAD TYPE ---
      if (pagesToConvert.length === 1 && singleBlob) {
          // A. Direct Download (Image)
          saveAs(singleBlob, singleFileName);
          setStatusText("Selesai! Gambar terdownload.");
      } else {
          // B. ZIP Download
          setStatusText("Mengompres ZIP...");
          const content = await zip.generateAsync({ type: "blob" });
          saveAs(content, `${pdfFile.name.replace('.pdf', '')}_converted.zip`);
          setStatusText("Selesai! ZIP terdownload.");
      }

    } catch (error) {
      console.error(error);
      setStatusText("Terjadi kesalahan sistem.");
    } finally {
      setIsProcessing(false);
      setProgress(100);
      setTimeout(() => { 
          if(statusText.includes("Selesai")) setStatusText(`Siap convert.`) 
      }, 3000);
    }
  };

  // --- LOGIC UI HELPERS ---
  const selectedCount = getSelectedPages().length;
  const isSingleOutput = selectedCount === 1;

  return (
    <div className="min-h-screen bg-slate-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-950 text-slate-100 font-sans flex items-center justify-center p-4">
      
      <div className="w-full max-w-4xl bg-slate-800/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col md:flex-row transition-all duration-500 hover:shadow-blue-500/10">
        
        {/* --- SIDEBAR KIRI --- */}
        <div className="w-full md:w-80 bg-slate-900/50 p-8 border-r border-slate-700/50 flex flex-col justify-between">
            <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-1">
                    Cipta PDF
                </h1>
                <p className="text-xs text-slate-500 mb-8">Secure Client-Side Converter</p>

                {/* Setting DPI */}
                <div className="mb-6">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Kualitas (DPI)</label>
                    <input 
                        type="number" 
                        value={dpi}
                        onChange={(e) => setDpi(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all mb-2"
                    />
                    <div className="flex gap-2 mt-2">
                        {[72, 150, 300].map(val => (
                            <button key={val} onClick={() => setDpi(val)} className={`text-[10px] px-2 py-1 rounded border transition-all duration-200 ${dpi===val ? 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-sm shadow-blue-500/20' : 'border-slate-600 text-slate-500 hover:border-slate-500 hover:text-slate-400'}`}>
                                {val === 72 ? 'Screen (72)' : val === 150 ? 'Med (150)' : 'Print (300)'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Setting Format */}
                <div className="mb-6">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Format Output</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-800/80 p-1 rounded-lg">
                        {['png', 'jpeg'].map(fmt => (
                             <button key={fmt} onClick={() => setFormat(fmt)} className={`py-1.5 text-xs font-bold rounded transition-all duration-200 ${format===fmt ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
                                {fmt.toUpperCase()}
                             </button>
                        ))}
                    </div>
                </div>

                {/* NEW LOGIC: Input Range (Hanya muncul jika halaman > 1) */}
                {numPages > 1 && (
                    <div className="mb-6 animate-in fade-in slide-in-from-top-2">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                            Rentang Halaman
                        </label>
                        <input 
                            type="text" 
                            placeholder={`Contoh: 1, 3-5 (Max ${numPages})`}
                            value={pageRange}
                            onChange={(e) => setPageRange(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            {pageRange ? `Akan memproses ${selectedCount} halaman.` : "Kosong = Semua halaman."}
                        </p>
                    </div>
                )}

            </div>

            {/* Info Status */}
            <div className="text-xs text-slate-500 border-t border-slate-700/50 pt-4">
                <p className={`transition-all ${isProcessing ? 'animate-pulse text-blue-400' : ''}`}>Status: <span className="text-slate-300">{statusText}</span></p>
                {isProcessing && <p className="mt-1 text-blue-400 font-mono font-bold">Progress: {progress}%</p>}
            </div>
        </div>

        {/* --- AREA UTAMA --- */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">  
            {!pdfFile ? (
                // LABEL PATTERN CUBE (Tetap sama)
                <label 
                    onDrop={handleDrop} 
                    onDragOver={handleDragOver}
                    className="relative w-full h-full min-h-[400px] border-2 border-dashed border-slate-600 hover:border-blue-400 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10"
                >
                    <input type="file" onChange={(e) => handleFileChange(e.target.files[0])} className="hidden" accept="application/pdf" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/10 pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-24 h-24 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-xl shadow-black/20 group-hover:shadow-blue-500/20 animate-pulse group-hover:animate-none">
                            <Upload size={40} className="text-slate-400 group-hover:text-blue-400 transition-colors"/>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-100 mb-2 drop-shadow-md">Upload PDF Disini</h3>
                        <p className="text-slate-400 text-sm text-center px-4 max-w-xs drop-shadow-md">Drag & Drop file Anda, atau klik area ini untuk menjelajah.</p>
                    </div>
                </label>
            ) : (
                <div className="w-full max-w-sm text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                    
                    <div className="relative w-28 h-28 mx-auto mb-6 group">
                        <div className="absolute inset-0 bg-red-500 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 animate-pulse"></div>
                        <div className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 rounded-2xl flex items-center justify-center shadow-2xl">
                            <FileText size={56} className="text-red-400 shadow-sm"/>
                        </div>
                    </div>
                    
                    <h2 className="text-xl font-bold text-white truncate px-4 mb-2">{pdfFile.name}</h2>
                    
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <span className="px-3 py-1 rounded-full bg-slate-700/50 text-xs text-slate-300 border border-slate-600">{numPages} Halaman</span>
                        <span className="px-3 py-1 rounded-full bg-slate-700/50 text-xs text-slate-300 border border-slate-600">{Math.round(pdfFile.size/1024)} KB</span>
                    </div>

                    {isProcessing ? (
                        <div className="w-full p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                            <div className="flex justify-between text-sm mb-2 font-semibold">
                                <span className="text-blue-400 animate-pulse">Memproses...</span>
                                <span className="text-slate-300">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden relative">
                                <div 
                                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-300 ease-out animate-stripes relative overflow-hidden" 
                                    style={{width: `${progress}%`}}
                                >
                                    <div className="absolute top-0 left-0 bottom-0 right-0 bg-gradient-to-b from-white/20 to-transparent"></div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button onClick={() => setPdfFile(null)} className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-bold transition-all active:scale-95">
                                Ganti
                            </button>
                            
                            {/* NEW LOGIC: Smart Button (Text & Icon berubah sesuai kondisi) */}
                            <button onClick={startConversion} className="flex-[2] py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-bold text-white shadow-lg shadow-blue-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 group relative overflow-hidden">
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                <span className="relative z-10 flex items-center gap-2">
                                   {/* Logic Kondisi Icon */}
                                   {isSingleOutput ? (
                                     <ImageIcon size={20} className="group-hover:-translate-y-1 transition-transform"/>
                                   ) : (
                                     <Download size={20} className="group-hover:-translate-y-1 transition-transform"/>
                                   )}
                                   
                                   {/* Logic Kondisi Text */}
                                   {isSingleOutput ? 'Convert Image' : 'Convert ZIP'}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default App;