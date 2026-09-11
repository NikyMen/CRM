import { AppError } from '../../types'

type StageMutationData = {
  name?: string
  color?: string
}

function stageScope(workspaceId: string, pipelineId: string, stageId: string) {
  return {
    id: stageId,
    pipelineId,
    pipeline: { workspaceId },
  }
}

function stageMutationScope(pipelineId: string, stageId: string) {
  return { id: stageId, pipelineId }
}

export async function assertStageInWorkspacePipeline(
  database: any,
  workspaceId: string,
  pipelineId: string,
  stageId: string
) {
  const stage = await database.stage.findFirst({
    where: stageScope(workspaceId, pipelineId, stageId),
  })
  if (!stage) throw new AppError(404, 'Etapa no encontrada')
  return stage
}

export async function updateStageInWorkspacePipeline(
  database: any,
  workspaceId: string,
  pipelineId: string,
  stageId: string,
  data: StageMutationData
) {
  await assertStageInWorkspacePipeline(database, workspaceId, pipelineId, stageId)

  const updated = await database.stage.updateMany({
    where: stageMutationScope(pipelineId, stageId),
    data,
  })
  if (updated.count !== 1) throw new AppError(404, 'Etapa no encontrada')

  const stage = await database.stage.findFirst({
    where: stageScope(workspaceId, pipelineId, stageId),
  })
  if (!stage) throw new AppError(404, 'Etapa no encontrada')
  return stage
}

export async function deleteStageInWorkspacePipeline(
  database: any,
  workspaceId: string,
  pipelineId: string,
  stageId: string
) {
  await assertStageInWorkspacePipeline(database, workspaceId, pipelineId, stageId)

  const deleted = await database.stage.deleteMany({
    where: stageMutationScope(pipelineId, stageId),
  })
  if (deleted.count !== 1) throw new AppError(404, 'Etapa no encontrada')
}
