# Quickstart: 检查引擎增强

**Feature**: 005-checker-enhance | **Date**: 2026-03-10

## Prerequisites

- Python ≥ 3.12
- Node.js ≥ 18
- 项目已按照 spec-001 的 quickstart 完成初始设置

## 1. 后端启动

```bash
cd docx-fix/backend

# 激活虚拟环境
source venv/bin/activate  # macOS/Linux

# 启动开发服务器
uvicorn app:app --reload --port 8000
```

## 2. 前端启动

```bash
cd docx-fix/frontend
npm run dev
```

## 3. 验证属性解析链增强

### 3.1 Run 直接格式检测

1. 准备一个测试文档：某段落的 Run 手动修改了字号（如改为 14pt，但规则要求 12pt）
2. 上传该文档并选择对应规则检查
3. 检查报告中应出现类似：**"Run 直接格式覆盖：字号当前 14pt，要求 12pt"**
4. 该检查项应标记为 **fixable**（可修复）

### 3.2 样式继承正确追溯

1. 准备一个测试文档：某段落样式定义了字体，但 Run 没有直接设置字体
2. 检查报告中，如果样式字体与规则一致，应报告 PASS
3. 如果样式字体与规则不一致，应报告 FAIL 并标注来源为"样式继承(xxx)"

### 3.3 docDefaults 回退

1. 准备一个测试文档：某 Run 和样式链均未设字号，但 docDefaults 定义了字号
2. 检查引擎应从 docDefaults 获取字号进行比对

## 4. 验证文档结构树检查

### 4.1 正常层级

1. 上传标题层级为 H1 → H2 → H3 → H2 → H1 → H2 的文档
2. "文档结构" 类别中**标题层级**检查项应 PASS

### 4.2 层级跳跃

1. 上传一个 H1 后直接出现 H3（跳过 H2）的文档
2. 应报告 FAIL：**"标题层级跳跃：'xxx'(H3) 出现在 H1 之后，缺少 H2 级别的标题"**

### 4.3 深度超限

1. 上传标题深度到 level 4 的文档，使用 max_heading_depth=3 的规则
2. 应报告 WARN：**"标题层级超过最大深度 3"**

## 5. 验证场景化预设规则

### 5.1 预设规则展示

1. 打开前端上传面板
2. 点击规则下拉列表
3. 应看到 4 个规则选项：
   - 通用默认检查
   - 哈工大(深圳)毕业论文中期报告
   - 通用学术论文 ← **新增，带"预设"小标签**
   - 国标公文 (GB/T 9704) ← **新增，带"预设"小标签**

### 5.2 使用预设规则检查

1. 选择"通用学术论文"预设
2. 上传一份学术论文文档
3. 检查报告应包含学术论文特有的结构检查项（摘要、参考文献等）

## 6. 运行测试

### 后端测试

```bash
cd docx-fix/backend
python -m pytest tests/ -v
```

预期所有测试通过，包括新增的：
- `tests/test_checker_inheritance.py` — 属性解析链测试
- `tests/test_checker_structure.py` — 文档结构树验证测试
- `tests/test_rule_presets.py` — 预设规则加载与格式校验测试

### 前端测试

```bash
cd docx-fix/frontend
npx vitest run
```

### 全量回归测试

```bash
cd docx-fix/backend && python -m pytest tests/ -v && cd ../frontend && npx vitest run
```

## 7. 关键文件索引

| 文件 | 说明 |
|------|------|
| `backend/scripts/checker/__init__.py` | checker 子包入口（re-export） |
| `backend/scripts/checker/base.py` | DocxChecker 核心类 |
| `backend/scripts/checker/property_resolver.py` | 属性解析链 |
| `backend/scripts/checker/heading_validator.py` | 标题层级树验证 |
| `backend/scripts/checker/style_checker.py` | 样式相关检查 |
| `backend/scripts/checker/numbering_checker.py` | 编号相关检查 |
| `backend/rules/academic_paper.yaml` | 通用学术论文预设 |
| `backend/rules/gov_document.yaml` | 国标公文预设 |
| `backend/services/rules_service.py` | 规则服务（新增 is_preset） |
| `frontend/src/components/UploadPanel.tsx` | 规则下拉（预设标签） |

## 8. CLI 验证

```bash
cd docx-fix

# 使用新预设规则检查
python backend/scripts/checker/base.py test.docx --rules backend/rules/academic_paper.yaml

# 使用现有规则检查（验证向后兼容）
python backend/scripts/checker/base.py test.docx --rules backend/rules/hit_midterm_report.yaml
```

## 9. 调试提示

- **属性解析链调试**：在 `PropertyResolver.resolve_run_properties()` 中添加 `logging.debug()` 查看每层解析结果
- **样式缓存命中**：`PropertyResolver._style_cache` 在第一次解析后缓存，检查缓存 key 是否正确（style_id）
- **basedOn 循环检测**：当出现 WARN "basedOn 链循环引用" 时，检查文档的 styles.xml 中是否存在 A→B→A 的引用
- **标题层级**：`_get_para_outline_level()` 优先读取段落直接设置的 outlineLvl，其次读取样式定义，最后通过 Heading N 样式名推断
