/**
 * 规则详情组件
 *
 * 功能：
 * - 按 section 分组展示规则详情
 * - 使用折叠面板交互
 * - 支持在 Drawer/Dialog 中展示
 */

import { useState, useEffect } from "react";
import { Collapse, Loading, Tag } from "tdesign-react";
import { fetchRuleDetail } from "../services/api";
import type { RuleDetailResponse, RuleDetailSection } from "../types";

const { Panel } = Collapse;

interface RuleDetailProps {
  ruleId: string;
}

export default function RuleDetail({ ruleId }: RuleDetailProps) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<RuleDetailResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    // 使用 queueMicrotask 避免在 effect 中同步调用 setState
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
    });
    fetchRuleDetail(ruleId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载规则详情失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ruleId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        <p>加载失败</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-4">
      {/* 规则基本信息 */}
      <div className="mb-4">
        <h3 className="text-lg font-medium text-gray-800">{detail.name}</h3>
        {detail.description && (
          <p className="text-sm text-gray-500 mt-1">{detail.description}</p>
        )}
      </div>

      {/* 规则详情折叠面板 */}
      {detail.sections.length > 0 ? (
        <Collapse defaultExpandAll expandIconPlacement="right">
          {detail.sections.map((section: RuleDetailSection, index: number) => (
            <Panel
              key={index}
              value={String(index)}
              header={
                <span className="font-medium text-gray-700">
                  {section.name}
                </span>
              }
            >
              <div className="space-y-2">
                {section.rules.map((rule, ruleIndex) => (
                  <div
                    key={ruleIndex}
                    className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded"
                  >
                    <span className="text-sm text-gray-600">{rule.item}</span>
                    <Tag theme="primary" variant="light" size="small">
                      {rule.value}
                    </Tag>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </Collapse>
      ) : (
        <div className="text-center py-6 text-gray-400">
          <p>暂无详细规则信息</p>
        </div>
      )}
    </div>
  );
}
