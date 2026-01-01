/**
 * 数据迁移脚本：为已有的图片生成 high_quality_image_url
 * 从 original_image_path 推导出 Web 访问 URL
 */

const path = require('path');
const { sequelize } = require('../server/config/database');

async function migrateImageUrls() {
    try {
        console.log('开始迁移图片URL...');

        // 查找所有有 original_image_path 但没有 high_quality_image_url 的记录
        const [generations] = await sequelize.query(`
            SELECT id, original_image_path
            FROM generations
            WHERE original_image_path IS NOT NULL
            AND original_image_path != ''
            AND (high_quality_image_url IS NULL OR high_quality_image_url = '')
        `);

        console.log(`找到 ${generations.length} 条需要迁移的记录`);

        let updated = 0;
        for (const gen of generations) {
            // 从路径提取文件名
            // 例如: /opt/yuan_world/public/images/generations/originals/abc123.png
            // 提取: abc123.png
            const fileName = path.basename(gen.original_image_path);
            const imageUrl = `/yuan/images/generations/originals/${fileName}`;

            await sequelize.query(`
                UPDATE generations
                SET high_quality_image_url = :imageUrl
                WHERE id = :id
            `, {
                replacements: {
                    imageUrl,
                    id: gen.id
                }
            });

            updated++;
            if (updated % 10 === 0) {
                console.log(`已更新 ${updated}/${generations.length} 条记录...`);
            }
        }

        console.log(`✅ 迁移完成！共更新 ${updated} 条记录`);
        process.exit(0);

    } catch (error) {
        console.error('❌ 迁移失败:', error);
        process.exit(1);
    }
}

// 执行迁移
migrateImageUrls();
