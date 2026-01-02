import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let filePath = searchParams.get('path');
    const size = parseInt(searchParams.get('size') || '128');

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    // 解析路径中的 ~ 为用户主目录
    const homeDir = os.homedir();
    if (filePath.startsWith('~')) {
      filePath = path.join(homeDir, filePath.slice(1));
    }

    // 解析绝对路径
    const absolutePath = path.resolve(filePath);

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

    // 检查文件扩展名是否为支持的图片类型
    const ext = path.extname(absolutePath).toLowerCase();
    const supportedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.svg', '.ico'];
    if (!supportedImageExts.includes(ext)) {
      return NextResponse.json(
        { error: 'File is not a supported image type' },
        { status: 400 }
      );
    }

    // 读取文件
    const fileBuffer = await fs.readFile(absolutePath);

    // 对于SVG和ICO，直接返回原始文件（不调整大小）
    if (ext === '.svg' || ext === '.ico') {
      const contentType = ext === '.svg' ? 'image/svg+xml' : 'image/x-icon';
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // 对于其他图片格式，使用sharp调整大小
    const thumbnailBuffer = await sharp(fileBuffer)
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();

    // 获取调整大小后的图片格式（保持原格式，除非是GIF，则转换为PNG以保持透明度）
    let outputFormat: keyof sharp.FormatEnum = ext.slice(1) as keyof sharp.FormatEnum;
    if (outputFormat === 'gif' || outputFormat === 'tiff') {
      outputFormat = 'png';
    }

    // 返回缩略图
    return new NextResponse(thumbnailBuffer, {
      status: 200,
      headers: {
        'Content-Type': `image/${outputFormat}`,
        'Cache-Control': 'public, max-age=86400', // 缓存1天
      },
    });
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    // 如果sharp处理失败，尝试返回原始图片（但尺寸可能较大）
    // 这里我们直接返回错误
    return NextResponse.json(
      { error: 'Failed to generate thumbnail' },
      { status: 500 }
    );
  }
}