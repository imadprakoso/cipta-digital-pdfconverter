import React, { useState } from 'react';
import { Upload, FileText, Download, Settings, Trash2, CheckCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- KONFIGURASI WORKER PDF.JS ---
// Kita ambil dari CDN agar tidak perlu setup manual file worker lokal
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

function App() {
  // State Data
  const [pdfFile, setPdfFile] = useState(null);
  const [numPages, setNumPages] = useState(0);
  
  // State Settings (Sesuai fitur Python Anda)
  const [dpi, setDpi] = useState(300); // Default High Quality
  const [format, setFormat] = useState('png'); // png atau jpeg
  
  // State Proses
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Menunggu File...');

  // 1. HANDLER UPLOAD
  const handleFileChange = async (file) => {
    if (!file || file.type !== 'application/pdf') {
      alert("Mohon upload file PDF yang valid.");
      return;
    }
    
    setPdfFile(file);
    setStatusText("Menganalisis PDF...");
    
    try {
      // Baca info PDF dulu (jumlah halaman)
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      setNumPages(pdf.numPages);
      setStatusText(`Siap convert ${pdf.numPages} halaman.`);
    } catch (error) {
      console.error(error);
      alert("Gagal membaca PDF. File mungkin rusak atau terpassword.");
      setPdfFile(null);
    }
  };

  // Drag & Drop Handlers
  const handleDrop = (e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => e.preventDefault();

  // 2. LOGIC CONVERT (THE ENGINE)
  const startConversion = async () => {
    if (!pdfFile) return;
    
    setIsProcessing(true);
    setProgress(0);
    const zip = new JSZip(); // Wadah ZIP baru
    
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      
      // Rumus Scale sesuai Python Anda: DPI / 72
      // 72 DPI adalah standar layar (Scale 1.0)
      const scale = dpi / 72;

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatusText(`Memproses Halaman ${i}/${pdf.numPages}...`);
        
        // A. Ambil Halaman
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: scale });

        // B. Siapkan Canvas (Virtual, tidak ditampilkan di layar agar ringan)
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // C. Render PDF ke Canvas
        await page.render({ canvasContext: context, viewport: viewport }).promise;

        // D. Convert Canvas ke Blob (File Gambar)
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, `image/${format}`, 0.9); // Quality 0.9 jika JPEG
        });

        // E. Masukkan ke ZIP
        const fileName = `page_${String(i).padStart(3, '0')}_${dpi}dpi.${format}`;
        zip.file(fileName, blob);

        // Update Progress Bar
        setProgress(Math.round((i / pdf.numPages) * 100));
        
        // Jeda 50ms agar UI tidak freeze (penting untuk browser)
        await new Promise(r => setTimeout(r, 50));
      }

      setStatusText("Mengompres ZIP...");
      const content = await zip.generateAsync({ type: "blob" });
      
      // Download Otomatis
      saveAs(content, `${pdfFile.name.replace('.pdf', '')}_converted.zip`);
      setStatusText("Selesai! File terdownload.");

    } catch (error) {
      console.error(error);
      setStatusText("Terjadi kesalahan sistem.");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex items-center justify-center p-4">
      
      <div className="w-full max-w-4xl bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 overflow-hidden flex flex-col md:flex-row">
        
        {/* --- SIDEBAR KIRI (Settings) --- */}
        <div className="w-full md:w-80 bg-slate-900/50 p-8 border-r border-slate-700 flex flex-col justify-between">
            <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-1">
                    Cipta PDF Converter
                </h1>
                <p className="text-xs text-slate-500 mb-8">Secure Client-Side Converter by imadprakoso</p>

                {/* Setting DPI */}
                <div className="mb-6">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Kualitas (DPI)</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            value={dpi}
                            onChange={(e) => setDpi(Number(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button onClick={() => setDpi(72)} className={`text-[10px] px-2 py-1 rounded border ${dpi===72 ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'border-slate-600 text-slate-500'}`}>Screen (72)</button>
                        <button onClick={() => setDpi(150)} className={`text-[10px] px-2 py-1 rounded border ${dpi===150 ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'border-slate-600 text-slate-500'}`}>Med (150)</button>
                        <button onClick={() => setDpi(300)} className={`text-[10px] px-2 py-1 rounded border ${dpi===300 ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'border-slate-600 text-slate-500'}`}>Print (300)</button>
                    </div>
                </div>

                {/* Setting Format */}
                <div className="mb-6">
                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Format Output</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-800 p-1 rounded-lg">
                        <button onClick={() => setFormat('png')} className={`py-1.5 text-xs font-bold rounded ${format==='png' ? 'bg-slate-600 text-white shadow' : 'text-slate-500'}`}>PNG</button>
                        <button onClick={() => setFormat('jpeg')} className={`py-1.5 text-xs font-bold rounded ${format==='jpeg' ? 'bg-slate-600 text-white shadow' : 'text-slate-500'}`}>JPG</button>
                    </div>
                </div>
            </div>

            {/* Info Status */}
            <div className="text-xs text-slate-500 border-t border-slate-700 pt-4">
                <p>Status: <span className="text-slate-300">{statusText}</span></p>
                {isProcessing && <p className="mt-1 text-blue-400 font-mono">Progress: {progress}%</p>}
            </div>
        </div>

        {/* --- AREA UTAMA (Kanan) --- */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
            
            {!pdfFile ? (
                // Tampilan Belum Upload
                <label 
                    onDrop={handleDrop} 
                    onDragOver={handleDragOver}
                    className="w-full h-full min-h-[300px] border-2 border-dashed border-slate-600 hover:border-blue-500 hover:bg-slate-800/50 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all group"
                >
                    <input type="file" onChange={(e) => handleFileChange(e.target.files[0])} className="hidden" accept="application/pdf" />
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xl">
                        <Upload size={32} className="text-slate-400 group-hover:text-blue-400"/>
                    </div>
                    <h3 className="text-xl font-bold text-slate-200">Upload PDF Disini</h3>
                    <p className="text-slate-500 text-sm mt-2">Drag & Drop atau Klik untuk Browse</p>
                </label>
            ) : (
                // Tampilan File Ready
                <div className="w-full max-w-sm text-center animate-in zoom-in duration-300">
                    <div className="w-24 h-24 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl">
                        <FileText size={48} className="text-red-500"/>
                    </div>
                    <h2 className="text-xl font-bold text-white truncate px-4">{pdfFile.name}</h2>
                    <p className="text-slate-400 text-sm mt-1 mb-8">{numPages} Halaman • {Math.round(pdfFile.size/1024)} KB</p>

                    {isProcessing ? (
                        // Progress Bar
                        <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden mb-4">
                            <div className="bg-blue-500 h-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                        </div>
                    ) : (
                        // Tombol Aksi
                        <div className="flex gap-3">
                            <button onClick={() => setPdfFile(null)} className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-slate-300 transition-colors">
                                Ganti File
                            </button>
                            <button onClick={startConversion} className="flex-[2] py-3 px-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2">
                                <Download size={18}/> Convert All
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