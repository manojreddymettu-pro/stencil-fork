import * as d from '../../declarations';
import { DEFAULT_STYLE_MODE } from '../../util/constants';
import { writeLazyEntryModule } from './write-lazy-module';


export async function generateLazyEntries(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, outputTargets: d.OutputTargetBuild[], build: d.Build, derivedModules: d.DerivedModule[]) {
  const promises = buildCtx.entryModules.map(async entryModule => {
    const mainModule = derivedModules[0];
    const entryKey = entryModule.entryKey;
    const chunkIndex = mainModule.list.findIndex(c => c.entryKey === entryKey);

    if (chunkIndex >= 0 && entryModule.modeNames != null) {
      const promises = entryModule.modeNames.map(async modeName => {
        await generateLazyEntryModuleMode(config, compilerCtx, buildCtx, outputTargets, build, derivedModules, entryModule, modeName, chunkIndex);
      });

      await Promise.all(promises);
    }
  });

  await Promise.all(promises);
}


async function generateLazyEntryModuleMode(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, outputTargets: d.OutputTargetBuild[], build: d.Build, derivedModules: d.DerivedModule[], entryModule: d.EntryModule, modeName: string, chunkIndex: number) {
  const promises = derivedModules.map(async derivedModule => {
    const chunk = derivedModule.list[chunkIndex];
    if (chunk != null) {
      const outputPromises = outputTargets.map(async outputTarget => {
        await generateLazyEntryModuleModeChunkOutput(config, compilerCtx, buildCtx, outputTarget, build, derivedModule, entryModule, modeName, chunk);
      });
      await Promise.all(outputPromises);
    }
  });

  await Promise.all(promises);
}


async function generateLazyEntryModuleModeChunkOutput(config: d.Config, compilerCtx: d.CompilerCtx, _buildCtx: d.BuildCtx, outputTarget: d.OutputTargetBuild, build: d.Build, derivedModule: d.DerivedModule, entryModule: d.EntryModule, modeName: string, chunk: d.DerivedChunk) {
  const c: string[] = [];

  if (config.logLevel === 'debug') {
    c.push(`/*!`);
    c.push(`  ${chunk.entryKey}`);
    c.push(`  ${entryModule.moduleFiles.map(m => m.cmpCompilerMeta.tagName).join(', ')}`);
    c.push(`  ${derivedModule.sourceTarget} ${derivedModule.moduleFormat}`);
    if (modeName !== DEFAULT_STYLE_MODE) {
      c.push(`  mode: ${modeName}`);
    }
    c.push(`*/`);
    c.push(``);
  }

  const registeredStyles = registerStyles(entryModule, modeName);

  const coreImports: string[] = [];

  if (build.vdomRender) {
    coreImports.push(`h`);
  }

  if (registeredStyles.length > 0) {
    coreImports.push(`registerStyle`);
  }

  if (coreImports.length > 0) {
    c.push(`import { ${coreImports.sort().join(', ')} } from '../${config.fsNamespace}.js';`);
    c.push(``);
  }

  c.push(
    chunk.code,
    ...registeredStyles
  );

  const jsText = c.join('\n');

  const bundleId = getBundleId(config, entryModule, modeName, jsText);

  await writeLazyEntryModule(config, compilerCtx, outputTarget, derivedModule, bundleId, jsText);
}


function registerStyles(entryModule: d.EntryModule, modeName: string) {
  const cmpsWithStyles = entryModule.moduleFiles
    .filter(m => m.cmpCompilerMeta != null)
    .filter(m => m.cmpCompilerMeta.styles != null && m.cmpCompilerMeta.styles.length > 0)
    .filter(m => m.cmpCompilerMeta.styles.some(s => s.modeName === modeName))
    .map(m => m.cmpCompilerMeta);

  return cmpsWithStyles.map(cmp => {
    return registerStyle(cmp, modeName);
  });
}


function registerStyle(cmp: d.ComponentCompilerMeta, modeName: string) {
  const styles = cmp.styles.find(s => s.modeName === modeName);

  let styleId = cmp.tagName.toUpperCase();
  if (modeName !== DEFAULT_STYLE_MODE) {
    styleId += '.' + modeName;
  }

  return `registerStyle('${styleId}', '${styles.compiledStyleText}');`;
}


function getBundleId(config: d.Config, entryModule: d.EntryModule, modeName: string, jsText: string) {
  if (config.hashFileNames) {
    // create bundle id from hashing the content
    return getBundleIdHashed(config, jsText);
  }

  return getBundleIdDev(entryModule, modeName);
}


function getBundleIdHashed(config: d.Config, jsText: string) {
  return config.sys.generateContentHash(jsText, config.hashedFileNameLength);
}


function getBundleIdDev(entryModule: d.EntryModule, modeName: string) {
  const tags = entryModule.moduleFiles
    .sort((a, b) => {
      if (a.isCollectionDependency && !b.isCollectionDependency) {
        return 1;
      }
      if (!a.isCollectionDependency && b.isCollectionDependency) {
        return -1;
      }

      if (a.cmpCompilerMeta.tagName < b.cmpCompilerMeta.tagName) return -1;
      if (a.cmpCompilerMeta.tagName > b.cmpCompilerMeta.tagName) return 1;
      return 0;
    })
    .map(m => m.cmpCompilerMeta.tagName);

  if (modeName === DEFAULT_STYLE_MODE || !modeName) {
    return tags[0];
  }

  return `${tags[0]}.${modeName}`;
}
