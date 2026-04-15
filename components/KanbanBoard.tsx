'use client'

import { useState, useRef } from 'react'
import { JOB_STAGES } from '@/lib/types'
import type { Job, JobStage } from '@/lib/types'

interface KanbanBoardProps {
  jobs: Job[]
  onJobClick: (job: Job) => void
  onStageChange: (jobId: string, newStage: JobStage) => Promise<void>
}

function daysAgo(created_at: string): number {
  const now = new Date().getTime()
  const createdMs = new Date(created_at).getTime()
  return Math.floor((now - createdMs) / (1000 * 60 * 60 * 24))
}

export default function KanbanBoard({
  jobs,
  onJobClick,
  onStageChange,
}: KanbanBoardProps) {
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<JobStage | null>(null)

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('jobId', jobId)
    setDraggedJobId(jobId)
  }

  const handleDragEnd = () => {
    setDraggedJobId(null)
    setDragOverStage(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetStage: JobStage) => {
    e.preventDefault()
    const jobId = e.dataTransfer.getData('jobId')
    if (jobId && dragOverStage === targetStage) {
      await onStageChange(jobId, targetStage)
    }
    setDraggedJobId(null)
    setDragOverStage(null)
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto h-full pb-4 px-1"
      style={{ scrollbarWidth: 'thin' }}
    >
      {JOB_STAGES.map((stage) => {
        const stageJobs = jobs.filter((j) => j.stage === stage.key)
        const isDropTarget = dragOverStage === stage.key

        return (
          <div
            key={stage.key}
            className="flex-shrink-0 w-48 flex flex-col"
            style={{ minHeight: '100%' }}
          >
            {/* Column header with color bar */}
            <div
              className="h-1 rounded-t-lg mb-2"
              style={{ backgroundColor: stage.color }}
            />

            {/* Stage label and count */}
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-white truncate">
                {stage.label}
              </span>
              <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full text-gray-400">
                {stageJobs.length}
              </span>
            </div>

            {/* Drop zone / cards container */}
            <div
              onDragOver={(e) => {
                handleDragOver(e)
                setDragOverStage(stage.key)
              }}
              onDragLeave={() => {
                if (dragOverStage === stage.key) {
                  setDragOverStage(null)
                }
              }}
              onDrop={(e) => handleDrop(e, stage.key)}
              className={`flex-1 rounded-lg p-1.5 min-h-32 transition-all ${
                isDropTarget
                  ? 'bg-white/5 border border-dashed border-white/20'
                  : 'border border-transparent'
              }`}
            >
              {stageJobs.length === 0 && !isDropTarget && (
                <div className="h-full flex items-center justify-center border border-dashed border-white/10 rounded-lg">
                  <p className="text-[10px] text-gray-600">Drop here</p>
                </div>
              )}

              {/* Job cards */}
              <div className="space-y-2">
                {stageJobs.map((job) => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, job.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onJobClick(job)}
                    className="bg-[#161b22] border border-white/10 rounded-lg p-3 mb-2 cursor-grab active:cursor-grabbing hover:border-white/20 transition-all"
                  >
                    <p className="text-xs font-semibold text-white leading-tight truncate">
                      {job.address}
                    </p>
                    {job.owner_name && (
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {job.owner_name}
                      </p>
                    )}
                    {job.contract_amount && (
                      <p className="text-xs text-cyan-400 font-bold mt-1.5">
                        ${job.contract_amount.toLocaleString()}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-600 mt-1">
                      {daysAgo(job.created_at)} days ago
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
