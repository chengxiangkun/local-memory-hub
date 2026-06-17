# Spike Results 011：升级迁移与数据保留

## 结论

第十一批 Spike 已通过。

已验证：

- API 可返回数据目录、当前 schema 版本和是否需要迁移。
- 可执行 schema migration。
- 迁移前会备份数据库和 schema 文件。
- 迁移后源资料数量保持不变。
- 数据目录路径可由 API 暴露给 UI。

## 新增接口

### 查看版本

```http
GET /api/system/version
```

返回：

- data_dir
- app_version
- schema_version
- latest_schema_version
- needs_migration

### 执行迁移

```http
POST /api/system/migrate
```

返回：

- 迁移状态
- 旧 schema 版本
- 新 schema 版本
- 备份目录
- 迁移前后源资料数量

## Smoke Test 结果

```text
Migration smoke test passed
{
  "status": "migrated",
  "from_schema_version": 1,
  "to_schema_version": 2,
  "source_count_before": 1,
  "source_count_after": 1
}
```

## 当前限制

- 只有一个示例迁移。
- 没有 UI。
- 没有回滚操作。
- 没有迁移失败注入测试。

## 下一步建议

1. 在设置页显示数据目录和 schema 版本。
2. 增加迁移失败恢复测试。
3. 后续每次 schema 变化都写 migration。

