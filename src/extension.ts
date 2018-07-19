import * as vscode from 'vscode';
import cp = require('child_process');
import path = require('path');
import {MODES,
        ALIAS} from './clangMode';
import {getBinPath} from './clangPath';
import sax = require('sax');

export let outputChannel = vscode.window.createOutputChannel('Clang-Format');

export class ClangDocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {
  private defaultConfigure = {
    executable: 'clang-format',
    style: 'file',
    fallbackStyle: 'none',
    assumeFilename: ''
  };

  public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
    return this.doFormatDocument(document, null, options, token);
  }

  public provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
    return this.doFormatDocument(document, range, options, token);
  }

  private getEdits(document: vscode.TextDocument, xml: string, codeContent: string): Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, reject) => {
      let options = {
        trim: false,
        normalize: false,
        loose: true
      };
      let parser = sax.parser(true, options);

      let edits: vscode.TextEdit[] = [];
      let currentEdit: { length: number, offset: number, text: string };

      let codeBuffer = new Buffer(codeContent);
      // encoding position cache
      let codeByteOffsetCache = {
        byte: 0,
        offset: 0
      };
      let byteToOffset = function(editInfo: { length: number, offset: number }) {
        let offset = editInfo.offset;
        let length = editInfo.length;

        if (offset >= codeByteOffsetCache.byte) {
          editInfo.offset = codeByteOffsetCache.offset + codeBuffer.slice(codeByteOffsetCache.byte, offset).toString('utf8').length;
          codeByteOffsetCache.byte = offset;
          codeByteOffsetCache.offset = editInfo.offset;
        } else {
          editInfo.offset = codeBuffer.slice(0, offset).toString('utf8').length;
          codeByteOffsetCache.byte = offset;
          codeByteOffsetCache.offset = editInfo.offset;
        }

        editInfo.length = codeBuffer.slice(offset, offset + length).toString('utf8').length;

        return editInfo;
      };

      parser.onerror = (err) => {
        reject(err.message);
      };

      parser.onopentag = (tag) => {
        if (currentEdit) {
          reject('Malformed output');
        }

        switch (tag.name) {
        case 'replacements':
          return;

        case 'replacement':
          currentEdit = {
            length: parseInt(tag.attributes['length'].toString()),
            offset: parseInt(tag.attributes['offset'].toString()),
            text: ''
          };
          byteToOffset(currentEdit);
          break;

        default:
          reject(`Unexpected tag ${tag.name}`);
        }

      };

      parser.ontext = (text) => {
        if (!currentEdit) { return; }

        currentEdit.text = text;
      };

      parser.onclosetag = (tagName) => {
        if (!currentEdit) { return; }

        let start = document.positionAt(currentEdit.offset);
        let end = document.positionAt(currentEdit.offset + currentEdit.length);

        let editRange = new vscode.Range(start, end);

        edits.push(new vscode.TextEdit(editRange, currentEdit.text));
        currentEdit = null;
      };

      parser.onend = () => {
        resolve(edits);
      };

      parser.write(xml);
      parser.end();

        //Get the complete text and start parsing it out
        codeContent=document.getText();
        var codeElements= codeContent.split("\n");
        var finalContent="";
        var flgFoundPrev = false;
        var flgFoundPrevBlank =false;
        var flgFoundPrevAgain=false;
        var trimElement=false;
        var isClassFile=fn.endsWith(".cls");;
        var fn= document.fileName;
        var addHeader="";
        
         //--------------------------------------------------
         //Add header if its not there at the TOP of the file
         //--------------------------------------------------
         if(isClassFile)
         {
          if(!codeElements[0].trim().startsWith("/*"))
          {
            //Add Comments Block at top if its missing
             addHeader="/**\n * @group \n * @description\n */\n" 
          }
         }
         //--------------------------------------------------

        codeElements.forEach(element => {
          //Remove multiple consecutive spaces 
         var nonwhitespaceindx= element.search(/\S|$/)
         element= " ".repeat(nonwhitespaceindx) +  element.substr(nonwhitespaceindx).replace(/  +/g, ' ');
        
         
          //------------------------------------
          //Getting Access Modifier on same line
          //------------------------------------
          var txt=element.trim().toUpperCase();
          trimElement=false;
          if(flgFoundPrev) 
          {
            if(!flgFoundPrevAgain)
            {
            finalContent = finalContent.trim()  + " "; 
            trimElement=true;
            }
          }
          else{
            if(finalContent!="")
            {
              if(!(txt=="" && flgFoundPrevBlank))
              {
                finalContent = finalContent.trim() + "\n";
              }
            }
          }
          
          if (txt=="PUBLIC" || txt=="PRIVATE" || txt=="PROTECTED")
          {
            if(flgFoundPrev){
            flgFoundPrevAgain=true;
            }
            else
            {
              flgFoundPrev=true;
              flgFoundPrevAgain=false;
              element= " " + element; // Adding a space to intend this line as well 
            }
          }
          else
          {
            flgFoundPrev=false;
            flgFoundPrevAgain=false;
          }
          //------------------------------------

          //-----------------------
          //Mutiple blank lines Fix
          //-----------------------
          if(txt=="" && flgFoundPrevBlank)
          {
            flgFoundPrevBlank=true;
          }
          else
          {
            if(txt=="")
            { 
              flgFoundPrevBlank=true;
              element=txt;
            }
            else{
              flgFoundPrevBlank=false;
            }
            if(trimElement)
            {
              finalContent = finalContent +  element.trim();
            }
            else {
              finalContent = finalContent +  element.replace(/ *$/, '');
            }
          }
          //-------------------
        });
        
            finalContent=addHeader+finalContent;
      
            vscode.window.activeTextEditor.edit(function (editor) {
              
              let documentEndPosition: vscode.Position =
              new vscode.Position(document.lineCount - 1,
                  document.lineAt(new vscode.Position(document.lineCount - 1, 0)).range.end.character);
                    let editRange: vscode.Range = new vscode.Range(new vscode.Position(0, 0), documentEndPosition);
              return editor.replace(editRange,finalContent );
          });

          setTimeout(this.highLightSensitiveContent, 500);
      });
  }


  //Hightlight lines/code which needs developer's attention
  private  highLightSensitiveContent() 
  {
    var document=vscode.window.activeTextEditor.document;
    var fn= document.fileName;
    const debugerPos: vscode.DecorationOptions[] = [];
    const consolePos: vscode.DecorationOptions[] = [];
    const text = document.getText();
    let match;

    
        // Identify the debugger and console.log statements in JS files
        if(fn.endsWith(".js"))
        {
          var regEx = /debugger/g;

          while (match = regEx.exec(text)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Remove debugger; from JS files' };
          
            debugerPos.push(decoration);
            
          }

          regEx = /console.log/g;

          while (match = regEx.exec(text)) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Remove console.log() from prod code' };
          
            consolePos.push(decoration);
            
          }
        }

        //Line Greater than 100 so highlight it
        var lines=    document.lineCount;
        while(lines>0)
        {
          var line=document.lineAt(lines-1).text;

          if(line.length>100)
          {
            const startPos = document.lineAt(lines-1).range.start;
            const endPos =  document.lineAt(lines-1).range.end;
            const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: 'Line greater than 100 chars' };
          
            consolePos.push(decoration);
          }
          lines=lines-1;
        }
    

        const highLightText = vscode.window.createTextEditorDecorationType({
          backgroundColor: 'rgba(255,0,0,0.3)'
        });
        const debuggerText = vscode.window.createTextEditorDecorationType({
          borderWidth: '1px',
          borderStyle: 'solid',
          overviewRulerColor: 'red',
          color: 'red',
          overviewRulerLane: vscode.OverviewRulerLane.Right,
          light: {
            // this color will be used in light color themes
            borderColor: 'darkred'
          },
          dark: {
            // this color will be used in dark color themes
            borderColor: 'lightred'
          }
        });
        
        vscode.window.activeTextEditor.setDecorations(debuggerText, debugerPos);
        vscode.window.activeTextEditor.setDecorations(highLightText, consolePos);
  }

  
  /// Get execute name in clang-format.executable, if not found, use default value
  /// If configure has changed, it will get the new value
  private getExecutablePath() {
    let execPath = vscode.workspace.getConfiguration('clang-format').get<string>('executable');
    if (!execPath) {
      return this.defaultConfigure.executable;
    }

    // replace placeholders, if present
    return execPath
      .replace(/\${workspaceRoot}/g, vscode.workspace.rootPath)
      .replace(/\${cwd}/g, process.cwd())
      .replace(/\${env\.([^}]+)}/g, (sub: string, envName: string) => {
        return process.env[envName];
      });
  }

  private getLanguage(document: vscode.TextDocument): string {
    return ALIAS[document.languageId] || document.languageId;
  }

  private getStyle(document: vscode.TextDocument) {
    let ret = vscode.workspace.getConfiguration('clang-format').get<string>(`language.${this.getLanguage(document)}.style`);
    if (ret.trim()) {
      return ret.trim();
    }

    ret = vscode.workspace.getConfiguration('clang-format').get<string>('style');
    if (ret && ret.trim()) {
      return ret.trim();
    } else {
      return this.defaultConfigure.style;
    }
  }

  private getFallbackStyle(document: vscode.TextDocument) {
    let strConf = vscode.workspace.getConfiguration('clang-format').get<string>(`language.${this.getLanguage(document)}.fallbackStyle`);
    if (strConf.trim()) {
      return strConf;
    }

    strConf = vscode.workspace.getConfiguration('clang-format').get<string>('fallbackStyle');
    if (strConf.trim()) {
      return strConf;
    }

    return this.defaultConfigure.style;
  }

  private getAssumedFilename(document: vscode.TextDocument) {
    let assumedFilename = vscode.workspace.getConfiguration('clang-format').get<string>('assumeFilename');
    if (assumedFilename === '') {
      return document.fileName;
    }
    return assumedFilename;
  }

  private doFormatDocument(document: vscode.TextDocument, range: vscode.Range, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, reject) => {
      let filename = document.fileName;

      let formatCommandBinPath = getBinPath(this.getExecutablePath());
      let codeContent = document.getText();

      let childCompleted = (err, stdout, stderr) => {
        try {
          if (err && (<any>err).code === 'ENOENT') {
            vscode.window.showInformationMessage('The \'' + formatCommandBinPath + '\' command is not available.  Please check your clang-format.executable user setting and ensure it is installed.');
            return resolve(null);
          }
          if (stderr) {
            outputChannel.show();
            outputChannel.clear();
            outputChannel.appendLine(stderr);
            return reject('Cannot format due to syntax errors.');
          }
          if (err) {
            return reject();
          }

          let dummyProcessor = (value: string) => {
            debugger;
            return value;
          };
          return resolve(this.getEdits(document, stdout, codeContent));

        } catch (e) {
          reject(e);
        }
      };

      let formatArgs = [
        '-output-replacements-xml',
        `-style=${this.getStyle(document)}`,
        `-fallback-style=${this.getFallbackStyle(document)}`,
        `-assume-filename=${this.getAssumedFilename(document)}`
      ];

      if (range) {
        let offset = document.offsetAt(range.start);
        let length = document.offsetAt(range.end) - offset;

        // fix charater length to byte length
        length = Buffer.byteLength(codeContent.substr(offset, length), 'utf8');
        // fix charater offset to byte offset
        offset = Buffer.byteLength(codeContent.substr(0, offset), 'utf8');

        formatArgs.push(`-offset=${offset}`, `-length=${length}`);
      }

      let workingPath = vscode.workspace.rootPath;
      if (!document.isUntitled) {
        workingPath = path.dirname(document.fileName);
      }

      let child = cp.execFile(formatCommandBinPath, formatArgs, { cwd: workingPath }, childCompleted);
      child.stdin.end(codeContent);

      if (token) {
        token.onCancellationRequested(() => {
          child.kill();
          reject('Cancelation requested');
        });
      }
    });
  }

  public formatDocument(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
    return this.doFormatDocument(document, null, null, null);
  }
}

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {

  let formatter = new ClangDocumentFormattingEditProvider();
  let availableLanguages = {};

  MODES.forEach((mode) => {
    ctx.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(mode, formatter));
    ctx.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(mode, formatter));
    availableLanguages[mode.language] = true;
  });
}
