"use client";

import { useState, useEffect, useCallback, KeyboardEvent, useRef } from 'react';
import Image from 'next/image';
import { ThemeToggle } from '@/components/theme-toggle';

// 定义文件/目录项的类型
type FSItem = {
  name: string;
  type: 'directory' | 'file';
  path: string;
  ext: string;
};

type DirectoryData = {
  path: string;
  absolutePath: string;
  items: FSItem[];
};

// 支持的图片扩展名
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif', '.ico'];

// 预加载图片的批次数
const PRELOAD_BATCH_SIZE = 20;

export default function Home() {
  // 当前目录路径
  const [currentPath, setCurrentPath] = useState<string>('~');
  // 目录内容
  const [directoryData, setDirectoryData] = useState<DirectoryData | null>(null);
  // 加载状态
  const [loading, setLoading] = useState<boolean>(true);
  // 错误信息
  const [error, setError] = useState<string | null>(null);
  
  // 图片查看器状态
  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [imageList, setImageList] = useState<FSItem[]>([]);
  const [currentImagePath, setCurrentImagePath] = useState<string>('');
  const viewerRef = useRef<HTMLDivElement>(null);
  
  // 预加载相关状态
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(new Set());
  const [lastPreloadedIndex, setLastPreloadedIndex] = useState<number>(-1);
  
  // 路径输入状态
  const [inputPath, setInputPath] = useState<string>('');
  
  // 缩略图加载失败记录
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  
  // 获取目录列表
  const fetchDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: DirectoryData = await response.json();
      setDirectoryData(data);
      setCurrentPath(data.path);
      // 重置失败记录，因为目录已更改
      setFailedThumbnails(new Set());
      // 重置预加载状态
      setPreloadedImages(new Set());
      setLastPreloadedIndex(-1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
      console.error('Error fetching directory:', err);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // 初始加载
  useEffect(() => {
    fetchDirectory('~');
  }, [fetchDirectory]);
  
  // 预加载图片函数
  const preloadImages = useCallback((startIndex: number, count: number = PRELOAD_BATCH_SIZE) => {
    if (!imageList || imageList.length === 0) return;
    
    const endIndex = Math.min(startIndex + count, imageList.length);
    const newPreloadedImages = new Set(preloadedImages);
    
    for (let i = startIndex; i < endIndex; i++) {
      const imagePath = imageList[i].path;
      if (!newPreloadedImages.has(imagePath)) {
        // 创建Image对象进行预加载
        const img = new window.Image();
        img.src = `/api/fs/file?path=${encodeURIComponent(imagePath)}`;
        newPreloadedImages.add(imagePath);
      }
    }
    
    setPreloadedImages(newPreloadedImages);
    setLastPreloadedIndex(endIndex - 1);
    
    console.log(`预加载图片: 索引 ${startIndex} 到 ${endIndex - 1}`);
  }, [imageList, preloadedImages]);
  
  // 打开图片查看器时预加载前20张图片
  const openImageViewerWithPreload = useCallback((item: FSItem) => {
    if (!directoryData) return;
    
    // 获取当前目录中的所有图片文件
    const imageItems = directoryData.items.filter(
      item => item.type === 'file' && IMAGE_EXTS.includes(item.ext.toLowerCase())
    );
    
    // 找到当前图片在列表中的索引
    const index = imageItems.findIndex(img => img.path === item.path);
    if (index === -1) return;
    
    setImageList(imageItems);
    setCurrentImageIndex(index);
    setCurrentImagePath(item.path);
    setViewerOpen(true);
    
    // 重置预加载状态
    setPreloadedImages(new Set());
    setLastPreloadedIndex(-1);
    
    // 预加载当前图片周围的20张图片
    // 从当前索引开始预加载
    setTimeout(() => {
      preloadImages(index, PRELOAD_BATCH_SIZE);
    }, 100);
  }, [directoryData, preloadImages]);
  
  // 处理目录项双击
  const handleItemDoubleClick = (item: FSItem) => {
    if (item.type === 'directory') {
      // 进入子目录
      fetchDirectory(item.path);
    } else if (IMAGE_EXTS.includes(item.ext.toLowerCase())) {
      // 打开图片查看器（带预加载）
      openImageViewerWithPreload(item);
    } else {
      // 非图片文件，暂时忽略或显示提示
      alert(`Cannot open file: ${item.name}`);
    }
  };
  
  // 图片查看器导航
  const navigateImage = (direction: 'prev' | 'next') => {
    if (imageList.length === 0) return;
    
    let newIndex;
    if (direction === 'prev') {
      newIndex = (currentImageIndex - 1 + imageList.length) % imageList.length;
    } else {
      newIndex = (currentImageIndex + 1) % imageList.length;
    }
    
    setCurrentImageIndex(newIndex);
    setCurrentImagePath(imageList[newIndex].path);
    
    // 检查是否需要预加载更多图片
    if (newIndex > lastPreloadedIndex - 10 && lastPreloadedIndex < imageList.length - 1) {
      // 当接近已预加载的末尾时，预加载下一批
      const nextBatchStart = lastPreloadedIndex + 1;
      preloadImages(nextBatchStart, PRELOAD_BATCH_SIZE);
    }
  };
  
  // 向上导航
  const handleGoUp = () => {
    const parts = currentPath.split('/').filter(part => part.length > 0);
    // 如果已经是根目录，则无法向上
    if (parts.length <= 1) {
      return;
    }
    // 构建父路径
    const parentPath = parts.slice(0, -1).join('/');
    // 如果父路径为空（理论上不会发生，因为parts.length>=2），则设置为根目录
    const finalParentPath = parentPath || '/';
    fetchDirectory(finalParentPath);
  };
  
  // 处理路径输入提交
  const handlePathSubmit = () => {
    if (inputPath.trim()) {
      fetchDirectory(inputPath.trim());
      setInputPath('');
    }
  };

  // 处理路径输入键盘事件
  const handlePathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePathSubmit();
    }
  };
  
  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!viewerOpen) return;
      
      switch (e.key) {
        case 'Escape':
          setViewerOpen(false);
          break;
        case 'ArrowLeft':
          navigateImage('prev');
          break;
        case 'ArrowRight':
          navigateImage('next');
          break;
        default:
          break;
      }
    };
    
    // 添加事件监听器
    window.addEventListener('keydown', handleKeyDown as any);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown as any);
    };
  }, [viewerOpen, currentImageIndex, imageList]);

  // 全屏处理
  useEffect(() => {
    if (!viewerOpen || !viewerRef.current) return;

    const enterFullscreen = async () => {
      try {
        if (viewerRef.current) {
          await viewerRef.current.requestFullscreen();
        }
      } catch (err) {
        console.error('Error attempting to enable fullscreen:', err);
      }
    };

    enterFullscreen();

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setViewerOpen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);

      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
  }, [viewerOpen]);
  
  // 格式化文件大小（暂未实现）
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black p-4 md:p-8">
      {/* 标题 */}
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">图片浏览器</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            双击文件夹进入，双击图片文件打开全屏查看器
          </p>
        </div>
        <div className="mt-1">
          <ThemeToggle />
        </div>
      </header>
      
      {/* 主内容区 */}
      <main className="max-w-6xl mx-auto">
        {/* 当前路径和导航 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleGoUp}
                disabled={currentPath.split('/').filter(part => part.length > 0).length <= 1}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                返回上级
              </button>
              <div className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-lg">
                当前路径: {currentPath}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  onKeyDown={handlePathKeyDown}
                  placeholder="输入路径 (绝对路径或相对路径)"
                  className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white w-64"
                />
                <button
                  onClick={handlePathSubmit}
                  disabled={!inputPath.trim()}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  前往
                </button>
              </div>
            </div>
            <button
              onClick={() => fetchDirectory(currentPath)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              刷新
            </button>
          </div>
          
          {/* 加载和错误状态 */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">正在加载目录...</p>
            </div>
          )}
          
          {error && !loading && (
            <div className="text-center py-8">
              <div className="text-red-500 mb-4">错误: {error}</div>
              <button
                onClick={() => fetchDirectory(currentPath)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                重试
              </button>
            </div>
          )}
          
          {/* 目录内容 */}
          {!loading && !error && directoryData && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {directoryData.items.map((item) => {
                const isImage = IMAGE_EXTS.includes(item.ext) && item.type === 'file';
                const thumbnailFailed = failedThumbnails.has(item.path);
                
                return (
                  <div
                    key={item.path}
                    className={`group relative cursor-pointer rounded-xl p-4 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl ${
                      item.type === 'directory'
                        ? 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/40 dark:hover:to-indigo-900/40'
                        : isImage
                        ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 hover:from-green-100 hover:to-emerald-100 dark:hover:from-green-900/40 dark:hover:to-emerald-900/40'
                        : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 hover:from-gray-100 hover:to-gray-200 dark:hover:from-gray-700 dark:hover:to-gray-800'
                    }`}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                  >
                    <div className="flex flex-col items-center text-center">
                      {/* 图标/缩略图 */}
                      <div className="mb-3">
                        {item.type === 'directory' ? (
                          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-500 text-white">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          </div>
                        ) : isImage ? (
                          // 图片文件：显示缩略图，如果加载失败则显示图标
                          thumbnailFailed ? (
                            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-green-500 text-white">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <img
                                src={`/api/fs/thumbnail?path=${encodeURIComponent(item.path)}&size=128`}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={() => {
                                  setFailedThumbnails(prev => new Set(prev).add(item.path));
                                }}
                              />
                            </div>
                          )
                        ) : (
                          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gray-500 text-white">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      {/* 名称 */}
                      <div className="font-medium text-gray-800 dark:text-white truncate w-full">
                        {item.name}
                      </div>
                      
                      {/* 类型标签 */}
                      <div className={`mt-1 text-xs px-2 py-1 rounded-full ${
                        item.type === 'directory'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : isImage
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {item.type === 'directory' ? '文件夹' : item.ext.toUpperCase().replace('.', '')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* 空目录 */}
          {!loading && !error && directoryData && directoryData.items.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">此目录为空</p>
            </div>
          )}
        </div>
        
        {/* 底部提示 */}
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm mt-8">
          <p>提示: 双击文件夹进入，双击图片文件全屏查看。全屏查看时使用左右箭头键切换图片，按ESC退出全屏。</p>
        </div>
      </main>      {/* 全屏图片查看器 */}
      {viewerOpen && (
        <div
          ref={viewerRef}
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setViewerOpen(false)}
        >
          <div className="relative w-full h-full flex items-center justify-center p-4">
            <img
              src={`/api/fs/file?path=${encodeURIComponent(currentImagePath)}`}
              alt={currentImagePath.split('/').pop()}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
              style={{
                // 确保图像在保持比例的同时尽可能大
                objectFit: 'contain',
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
                maxHeight: '100%',
                // 确保平滑显示
                imageRendering: 'auto'
              }}
            />
          </div>
        </div>
      )}
      
      {/* 全局样式 */}
      <style jsx global>{`
        body {
          overflow: ${viewerOpen ? 'hidden' : 'auto'};
        }
      `}</style>
    </div>
  );
}