import * as vscode from 'vscode';
import { MessagePort, MessageChannel, receiveMessageOnPort, Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { resolve } from 'node:path';
import { timeStamp } from 'node:console';
import { Stopwatch } from 'ts-stopwatch';
import { watch } from 'node:fs';

/** 
 * @class   Disassembler
 * @brief   Responsible for disassembling a file
 * @author  GrandChris
 * @date    2021-03-18
 */
export class Disassembler {

    private readonly out: vscode.OutputChannel;

    private readonly worker_filename: string = "elflens_worker.js";
    private worker: Worker;
    private readonly asmInputPort : MessagePort;
    private readonly asmResultPort : MessagePort;
    private readonly lineInputPort : MessagePort;
    private readonly lineResultPort : MessagePort;

    private isDisassembling : boolean = false;
    private eventFinishedDisassemblingFile : EventEmitter = new EventEmitter();
    private asmFileName : string = "";

    /** 
     * @brief   Constructor
     * @author  GrandChris
     * @date    2021-03-18
     */
    constructor(out: vscode.OutputChannel) {
        const watch = new Stopwatch;
        watch.start();
        this.out = out;
        this.out.append("Setting up worker thread: ");

        const asmInputChannel = new MessageChannel();
        const asmResultChannel = new MessageChannel();        
        const lineInputChannel = new MessageChannel();
        const lineResultChannel = new MessageChannel();

        this.asmInputPort = asmInputChannel.port1;
        this.asmResultPort = asmResultChannel.port1;
        this.lineInputPort = lineInputChannel.port1;
        this.lineResultPort = lineResultChannel.port1;

        const messageChannels = {
            asmInputPort: asmInputChannel.port2,
            asmResultPort: asmResultChannel.port2,
            lineInputPort: lineInputChannel.port2,
            lineResultPort: lineResultChannel.port2
        };

        this.lineInputPort.on("message", (params: any) => {
            console.log("this.lineInputPort" + params);
            // this.writeFile(params);
        });

        const abs_worker_filename = __dirname + "/" + this.worker_filename;
        this.worker = new Worker(abs_worker_filename);

        this.worker.on('error', (err : any) => {
            console.log(err);
        });

        this.worker.postMessage(messageChannels, [
            messageChannels.asmInputPort, 
            messageChannels.asmResultPort,
            messageChannels.lineInputPort,
            messageChannels.lineResultPort
        ]);

        watch.stop()
        this.out.appendLine(watch.getTime().toString() + " ms");
    }

    /** 
     * @brief   Writes the .asm file to the disk
     * @author  GrandChris
     * @date    2021-03-18
     */
    private async writeFile(data: any) {
        console.log(data);
        const content: Uint8Array = data.content;
        const fileName: string = data.fileName;

        try {
            this.asmFileName = fileName + ".asm";
            const uri_write = vscode.Uri.file(this.asmFileName);
            await vscode.workspace.fs.writeFile(uri_write, content);
            console.log("finished writing the file");
        }
        catch (err){
            console.log(err);
            vscode.window.showInformationMessage('elf-lens: ' + err);
            return;
        }
    }

    /** 
     * @brief   Opens the .asm file and jumps the line corresponding to the given file
     * @author  GrandChris
     * @date    2021-03-18
     */
    public async showLine(params: any) {
        const fileName: string = params.currentFile;
        const lineNumber: number = params.currentLine;
        const columnNumber: number = params.currentColumn;

        var res : number = await new Promise((resolve, reject) => {
            this.lineResultPort.once("message", async (params: number) => {
                console.log("this.asmResultPort" + params);
                resolve(params);
            });
            this.lineInputPort.postMessage(params);
          });

        const asmLineNumber : number = res;
        console.log("asmLineNumber: " + res);

        const start = new vscode.Position(asmLineNumber, 0);
        const end = new vscode.Position(asmLineNumber, 0)
        const range = new vscode.Range(start, end);

        const opts: vscode.TextDocumentShowOptions = {
            selection: range,
            viewColumn: 2,
            preserveFocus: true
        };
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.asmFileName), opts);
    }

    /** 
     * @brief   Disassembles a file
     * @author  GrandChris
     * @date    2021-03-18
     */
    public async disassemble(fileName: string, sourceLine: any) {
        const watch = new Stopwatch;
        watch.start();


        if(this.isDisassembling == true) {
            this.out.appendLine("sorry, another disassembling is still going on");
            return;
        }
        this.isDisassembling = true;

        this.out.append("Read file: ");
        const uri = vscode.Uri.file(fileName);
        try {
			const content: Uint8Array = await vscode.workspace.fs.readFile(uri);
            var data = {
                content : content,
                fileName : fileName
            };

            watch.stop();
            this.out.appendLine(watch.getTime().toString() + " ms");
            watch.reset();
            watch.start();
            this.out.append("Sending raw file content to the worker thread: ");
            
            var res = await new Promise((resolve, reject) => {
                this.asmResultPort.once("message", async (params: any) => {
                    watch.stop();
                    this.out.appendLine(watch.getTime().toString() + " ms");
                    resolve(params);
                });
                this.asmInputPort.postMessage(data, [ data.content.buffer ]);
                watch.stop();
                this.out.appendLine(watch.getTime().toString() + " ms");
                watch.reset();
                this.out.append("Disassemble content: ");
                watch.start();
              });

              this.out.append("Write file: ");
              watch.reset();
              watch.start();

              await this.writeFile(res);

              watch.stop();
              this.out.appendLine(watch.getTime().toString() + " ms");
              this.out.append("Find asm line number: ");
              watch.reset();
              watch.start();

              await this.showLine(sourceLine);
              watch.stop();
              this.out.appendLine(watch.getTime().toString() + " ms");
		}
		catch (err){
			console.log(err);
			vscode.window.showInformationMessage('elf-lens: ' + err);
		}

        this.isDisassembling = false;
    }
}