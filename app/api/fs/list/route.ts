import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let dirPath = searchParams.get('path') || '~';
    
    // 解析路径中的 ~ 为用户主目录
    const homeDir = os.homedir();
    if (dirPath.startsWith('~')) {
      dirPath = path.join(homeDir, dirPath.slice(1));
    }
    
    // 解析绝对路径
    const rootDir = process.cwd();
    const absolutePath = path.resolve(dirPath);
    
    // 检查路径是否存在且为目录
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: 'Path is not a directory' },
          { status: 400 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Directory not found' },
        { status: 404 }
      );
    }
    
    // 读取目录内容
    const items = await fs.readdir(absolutePath, { withFileTypes: true });
    
    // 过滤掉隐藏文件（以.开头）
    const filteredItems = items.filter(item => !item.name.startsWith('.'));
    
    // 排序：目录在前，文件在后，按名称排序
    const sortedItems = filteredItems.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // 格式化返回数据
    const result = sortedItems.map(item => ({
      name: item.name,
      type: item.isDirectory() ? 'directory' : 'file',
      path: path.relative(rootDir, path.join(absolutePath, item.name)).replace(/\\/g, '/'),
      ext: item.isDirectory() ? '' : path.extname(item.name).toLowerCase(),
    }));
    
    // 返回路径使用正斜杠
    const displayPath = absolutePath.replace(/\\/g, '/');
    
    return NextResponse.json({
      path: displayPath,
      absolutePath: absolutePath,
      items: result,
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}