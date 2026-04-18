'use client';

import { useState } from 'react';
import { Globe, Camera, FileArchive, CheckCircle, AlertCircle, Loader2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Home() {
  const [url, setUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, number> | null>(null);
  const [zipData, setZipData] = useState<{ base64: string; filename: string } | null>(null);

  const startScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsScanning(true);
    setProgress('Starting...');
    setError(null);
    setErrorDetails(null);
    setZipData(null);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Handle NDJSON stream correctly
        const lines = buffer.split('\n');
        // The last line might be incomplete, so keep it in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          try {
            const data = JSON.parse(trimmedLine);
            if (data.status === 'progress') {
              setProgress(data.message);
            } else if (data.status === 'complete') {
              setProgress(data.message);
              setZipData({ base64: data.zip, filename: data.filename });
              setIsScanning(false);
              downloadZip(data.zip, data.filename);
            } else if (data.status === 'error') {
              setError(data.message);
              setErrorDetails(data.details ?? null);
              setIsScanning(false);
              return; // Stop processing further lines
            }
          } catch (e: any) {
            console.error('Failed to parse line:', trimmedLine, e);
          }
        }
      }
    } catch (err: any) {
      console.error('Scan fetch error:', err);
      setError(err.message || 'An unexpected error occurred');
      setIsScanning(false);
    }
  };

  const downloadZip = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:application/zip;base64,${base64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            SiteSnap <span className="text-gray-600 text-xs sm:text-xs">( by Ammar )</span>
          </h1>
          <p className="text-lg text-slate-600">
            just spit it out and take all those screenshots man!
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8 space-y-6">
          <form onSubmit={startScan} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Globe className="h-5 w-5 text-slate-600" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="block w-full pl-10 pr-3 py-4 border border-slate-200 rounded-xl leading-5 bg-white text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                disabled={isScanning}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isScanning || !url}
              className={cn(
                "w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                isScanning && "bg-blue-500"
              )}
            >
              {isScanning ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
                  Scanning...
                </>
              ) : (
                'Start Scan'
              )}
            </button>
          </form>

          {/* Progress Area */}
          {(isScanning || progress || error || zipData) && (
            <div className="mt-8 space-y-4 pt-6 border-t border-slate-100">
              {error ? (
                <div className="p-4 text-red-800 rounded-xl bg-red-50 border border-red-100 space-y-2">
                  <div className="flex items-center">
                    <AlertCircle className="shrink-0 w-5 h-5 mr-3" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                  {errorDetails && (
                    <p className="text-xs text-red-700">
                      Reasons: navigation failed {errorDetails.navigation_failed ?? 0}, non-HTML {errorDetails.skipped_non_html_document ?? 0}, HTTP errors {errorDetails.http_errors ?? 0}, filtered URLs {errorDetails.skipped_non_page_url ?? 0}, other {errorDetails.other_errors ?? 0}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <div className="flex items-center">
                      {zipData ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      ) : (
                        <div className="w-5 h-5 mr-2 flex items-center justify-center">
                           <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        </div>
                      )}
                      <span>{progress}</span>
                    </div>
                  </div>
                  
                  {isScanning && (
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-600 h-full animate-pulse rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  )}

                  {zipData && (
                    <div className="flex flex-col space-y-3">
                      <div className="flex items-center p-4 bg-green-50 border border-green-100 rounded-xl">
                        <FileArchive className="w-8 h-8 text-green-600 mr-4" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-green-900">{zipData.filename}</p>
                          <p className="text-xs text-green-700">All screenshots captured successfully</p>
                        </div>
                        <button
                          onClick={() => downloadZip(zipData.base64, zipData.filename)}
                          className="flex items-center px-4 py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="p-4 space-y-1">
            <Globe className="w-5 h-5 mx-auto text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Auto-Crawler</h3>
            <p className="text-xs text-slate-500">Finds internal pages via sitemap or deep crawl.</p>
          </div>
          <div className="p-4 space-y-1">
            <Camera className="w-5 h-5 mx-auto text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Full-Page</h3>
            <p className="text-xs text-slate-500">High resolution screenshots of every page.</p>
          </div>
          <div className="p-4 space-y-1">
            <FileArchive className="w-5 h-5 mx-auto text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">ZIP Export</h3>
            <p className="text-xs text-slate-500">Download everything in one neat package.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
