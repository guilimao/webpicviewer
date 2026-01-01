import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }
    
    // 安全限制：只允许访问项目根目录下的路径
    const rootDir = process.cwd();
    const absolutePath = path.resolve(rootDir, filePath);
    
    // 如果环境变量 ALLOW_OUTSIDE_ROOT 未设置为 'true'，则限制只能访问项目根目录内
    const allowOutside = process.env.ALLOW_OUTSIDE_ROOT === 'true' || process.env.ALLOW_OUTSIDE_ROOT === '1';
    if (!allowOutside && !absolutePath.startsWith(rootDir)) {
      return NextResponse.json(
        { error: 'Access denied. To access outside the project root, set ALLOW_OUTSIDE_ROOT=true' },
        { status: 403 }
      );
    }
    
    // 检查文件是否存在
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isDirectory()) {
        return NextResponse.json(
          { error: 'Path is a directory, not a file' },
          { status: 400 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // 获取文件扩展名以确定Content-Type
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = getContentType(ext);
    
    // 读取文件
    const fileBuffer = await fs.readFile(absolutePath);
    
    // 返回文件内容
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error reading file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  return contentTypes[ext] || 'application/octet-stream';
}