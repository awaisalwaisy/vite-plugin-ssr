export { getAllPageIdFilesClientSide }
export { getAllPageIdFilesServerSide }

import type { FileType, PageFile } from './types'
import { assert, assertUsage, assertPosixPath, isNotNullish } from '../utils'

function getAllPageIdFilesClientSide(pageFilesAll: PageFile[], pageId: string) {
  return determine(pageFilesAll, pageId, true)
}
function getAllPageIdFilesServerSide(pageFilesAll: PageFile[], pageId: string) {
  return determine(pageFilesAll, pageId, false)
}
function determine(pageFilesAll: PageFile[], pageId: string, forClientSide: boolean): PageFile[] {
  const fileTypeEnv = forClientSide ? ('.page.client' as const) : ('.page.server' as const)
  const sorter = defaultFilesSorter(fileTypeEnv, pageId)

  const pageFilesRelevant = pageFilesAll.filter((p) => p.isRelevant(pageId))

  const getRendererFile = (fileType: FileType) =>
    pageFilesRelevant.filter((p) => p.isRendererPageFile && p.fileType === fileType).sort(sorter)[0]
  const getPageIdFile = (fileType: FileType) => {
    const files = pageFilesRelevant.filter((p) => p.pageId === pageId && p.fileType === fileType)
    assertUsage(
      files.length <= 1,
      `Merge the following files into a single file: ${files.map((p) => p.filePath).join(' ')}`
    )
    const pageIdFile = files[0]
    assert(pageIdFile === undefined || !pageIdFile.isDefaultPageFile)
    return files[0]
  }

  // A page can load multiple `_defaut.page.*` files of the same `fileType`. In other words: non-renderer `_default.page.*` files are cumulative.
  // The exception being HTML-only pages because we pick a single page file as client entry. We handle that use case at `renderPage()`.
  const defaultFilesNonRenderer = pageFilesRelevant.filter(
    (p) => p.isDefaultPageFile && !p.isRendererPageFile && (p.fileType === fileTypeEnv || p.fileType === '.page')
  )
  defaultFilesNonRenderer.sort(sorter)

  // A page can have only one renderer. In other words: Multiple `renderer/` overwrite each other.
  const rendererFileEnv = getRendererFile(fileTypeEnv)
  const rendererFileIso = getRendererFile('.page')

  const pageIdFileEnv = getPageIdFile(fileTypeEnv)
  const pageIdFileIso = getPageIdFile('.page')

  // Ordered by `pageContext.exports` precendence
  let pageFiles = [pageIdFileEnv, pageIdFileIso, ...defaultFilesNonRenderer, rendererFileEnv, rendererFileIso].filter(
    isNotNullish
  )

  return pageFiles
}

function defaultFilesSorter(fileTypeEnv: FileType, pageId: string) {
  const e1First = -1 as const
  const e2First = +1 as const
  const noOrder = 0 as const
  return (e1: PageFile, e2: PageFile): 0 | 1 | -1 => {
    assert(e1.isDefaultPageFile && e2.isDefaultPageFile)

    // Non-renderer `_default.page.*` before `renderer/**/_default.page.*`
    {
      const e1_isRenderer = e1.isRendererPageFile
      const e2_isRenderer = e2.isRendererPageFile
      if (!e1_isRenderer && e2_isRenderer) {
        return e1First
      }
      if (!e2_isRenderer && e1_isRenderer) {
        return e2First
      }
      assert(e1_isRenderer === e2_isRenderer)
    }

    // Filesystem nearest first
    {
      const e1_distance = getPathDistance(pageId, e1.filePath)
      const e2_distance = getPathDistance(pageId, e2.filePath)
      if (e1_distance < e2_distance) {
        return e1First
      }
      if (e2_distance < e1_distance) {
        return e2First
      }
      assert(e1_distance === e2_distance)
    }

    // `.page.server.js`/`.page.client.js` before `.page.js`
    {
      if (e1.fileType === fileTypeEnv && e2.fileType !== fileTypeEnv) {
        return e1First
      }
      if (e2.fileType === fileTypeEnv && e1.fileType !== fileTypeEnv) {
        return e2First
      }
    }

    // Probably useless since `e1.fileType`/`e2.fileType` is always either `fileTypeEnv` or `.page.js`
    // But to be clear that `.page.js` always comes after `.page.server.js`/`.page.client.js`
    {
      if (e1.fileType === '.page' && e2.fileType !== '.page') {
        return e2First
      }
      if (e2.fileType === '.page' && e1.fileType !== '.page') {
        return e1First
      }
    }

    return noOrder
  }
}

function getPathDistance(pathA: string, pathB: string): number {
  assertPosixPath(pathA)
  assertPosixPath(pathB)
  assert(pathA.startsWith('/'))
  assert(pathB.startsWith('/'))

  // Index of first different character
  let idx = 0
  for (; idx < pathA.length && idx < pathB.length; idx++) {
    if (pathA[idx] !== pathB[idx]) break
  }

  const pathAWithoutCommon = pathA.slice(idx)
  const pathBWithoutCommon = pathB.slice(idx)

  const distanceA = pathAWithoutCommon.split('/').length
  const distanceB = pathBWithoutCommon.split('/').length

  const distance = distanceA + distanceB

  return distance
}
