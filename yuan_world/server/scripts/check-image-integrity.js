// 检查原图文件完整性
const { sequelize } = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

async function checkImageIntegrity() {
    console.log('🔍 开始检查原图文件完整性...\n');
    
    try {
        // 查询所有completed状态的记录
        const [generations] = await sequelize.query(`
            SELECT id, original_image_path, created_at 
            FROM generations 
            WHERE status = 'completed' 
            AND original_image_path IS NOT NULL
            ORDER BY created_at DESC
        `);
        
        console.log(`📊 数据库记录总数: ${generations.length}`);
        
        let existCount = 0;
        let missingCount = 0;
        const missingFiles = [];
        
        for (const gen of generations) {
            const filePath = gen.original_image_path;
            
            // 只检查服务器路径
            if (filePath && filePath.startsWith('/opt/yuan_world')) {
                try {
                    await fs.access(filePath);
                    existCount++;
                } catch (err) {
                    missingCount++;
                    missingFiles.push({
                        id: gen.id,
                        path: filePath,
                        date: gen.created_at
                    });
                }
            }
        }
        
        console.log(`\n✅ 文件存在: ${existCount}`);
        console.log(`❌ 文件丢失: ${missingCount}`);
        
        if (missingCount > 0) {
            console.log(`\n⚠️  丢失的文件列表:`);
            missingFiles.forEach((file, index) => {
                console.log(`${index + 1}. ID: ${file.id}`);
                console.log(`   路径: ${file.path}`);
                console.log(`   日期: ${new Date(file.date).toLocaleString()}\n`);
            });
        }
        
        // 检查实际文件数量
        const originalsDir = path.join(__dirname, '../../public/images/generations/originals');
        const files = await fs.readdir(originalsDir);
        const pngFiles = files.filter(f => f.endsWith('.png'));
        
        console.log(`\n📁 实际PNG文件数: ${pngFiles.length}`);
        console.log(`💾 目录大小: ${(await getDirSize(originalsDir) / 1024 / 1024).toFixed(2)} MB`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ 检查失败:', error);
        process.exit(1);
    }
}

async function getDirSize(dirPath) {
    const files = await fs.readdir(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
            totalSize += stat.size;
        }
    }
    
    return totalSize;
}

checkImageIntegrity();
