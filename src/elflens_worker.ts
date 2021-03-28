
import { MessageChannel, Worker, workerData, parentPort } from 'worker_threads';
import * as encoding from 'text-encoding';
import { MessagePort } from 'node:worker_threads';

console.log("Hello world from elflens_worker.ts");

type Nullable<T> = T | null;

/**
 * @brief Returns the current selected line of the editor 
 * @param {string}  p1 - A string param.
 * @param {string=} p2 - An optional param (Closure syntax)
 * @param {string} [p3] - Another optional param (JSDoc syntax).
 * @param {string} [p4="test"] - An optional param with a default value
 * @return {string} This is the result
 */

/** 
 * @class   Line
 * @brief   The description of a line in a source file
 * @author  GrandChris
 * @date    2021-03-18
 */
interface Line {
    filename: string;         // The name of the source file 
    path: string;             // The path to the source file
    line: number;             // The line number inside the source file
    column: number;           // The column number inside the source file 
    isStartSequence: boolean; // If the line number is the start of a function
}

/** 
 * @class    DisassembledLine
 * @brief    A disassembled opcode with info of the corresponding source file
 * @author   GrandChris
 * @date     2021-03-18
 */
interface DisassembledLine {
    address: number;               // The program address of the opcode 
    opcode_description: string;    // opcode as mnemonic and operands   
    branch_destination: number;    // The program address to the destination of a branch instruction    
    branch_destination_line: Line; // The description of a line in a source file of the destination of a branch instruction    
    line: Line;                    // The description of a line in a source file  
    index: number;                 // The line number in the .asm file
}

/** 
 * @class    DisassembledFile
 * @brief    A struct with a line for every opcode in the .text section
 * @author   GrandChris
 * @date     2021-03-18
 */
interface DisassembledFile {
    filename : string;  // The name of the disassembled .elf file (if available)
    lines : Array<DisassembledLine>; // A line for every opcode in the .text section
}


/** 
 * @class    ElfLensWorker
 * @brief    Class running as Nodejs Worker-Thread disassembling file content
 * @author   GrandChris
 * @date     2021-03-18
 */
class ElfLensWorker {
    private elf_analysis : any = null;  // reference to the C++ functions
    private disassembledFile : Nullable<DisassembledFile> = null;       // the disassembled data
    private sortedDisassembledFile : Nullable<DisassembledFile> = null; // the disassembled data but sorted

    /** 
     * @brief    Searches for the line number in the .asm file for a source code line
     * @author   GrandChris
     * @date     2021-03-18
     */
    public getLineNumber(params: any) {
        const fileName : string = params.currentFile;
        const lineNumber : number = params.currentLine + 1;
        const columnNumber: number = params.currentColumn;

        console.log("fileName: ", fileName, ":", lineNumber, ":", columnNumber);

        if(this.sortedDisassembledFile == null) {
            return 0;
        }

        const lines = this.sortedDisassembledFile.lines;

        const absPathToFind = fileName.replace(/\\/g, '/').toUpperCase();;

        // sorted linear find algorithm
        for(var i = 0; i < lines.length; ++i) {
            const absPath = (lines[i].line.path + "/" + lines[i].line.filename).toUpperCase();

            if(absPath >= absPathToFind) {
                var j = i;
                for(var j = i; j < lines.length; ++j) {
                    if(lines[j].line.line >= lineNumber) {
                        console.log(absPathToFind + ":" + lineNumber);
                        console.log(absPath + ":" + lines[j].line.line);
                        return lines[j].index;
                    }
                }

                console.log(absPathToFind + ":" + lineNumber);
                console.log(absPath + ":" + lines[i].line.line);
                return lines[i].index;;
            }
        }

        return 0;

    }

    /** 
     * @brief    Disassembles the content of a file
     * @author   GrandChris
     * @date     2021-03-18
     */
    public async disassemble(params: any) {
        const content : Uint8Array = params.content;
        const fileName : string = params.fileName;

        this.disassembledFile = await this.parseElfFile(content);
        this.sortPerFileName();

        const fileContent = await this.toString(this.disassembledFile);

        var enc = new encoding.TextEncoder();
        const encoded : Uint8Array = enc.encode(fileContent);

        var data = {
            content : encoded,
            fileName : fileName
        };

        return data;
    }

    /** 
     * @brief    Sorts the disassembled content
     * @author   GrandChris
     * @date     2021-03-18
     */
    private sortPerFileName() {
        const sortedDisassembledFile = JSON.parse(JSON.stringify(this.disassembledFile));
        // const sortedDisassembledFile = this.disassembledFile;
        sortedDisassembledFile?.lines.sort((a:DisassembledLine, b:DisassembledLine) => {
            const a_absPath = a.line.path + "/" + a.line.filename;
            const b_absPath = b.line.path + "/" + b.line.filename;

            if(a_absPath < b_absPath) {
                return -1;
            } else if(a_absPath == b_absPath) {
                if(a.line.line < b.line.line) {
                    return -1;
                }
            }
            return 1;
        });

        this.sortedDisassembledFile = sortedDisassembledFile;
    }

    /** 
     * @brief    Instantiates the C++ bindings
     * @author   GrandChris
     * @date     2021-03-18
     */
    private async create_elf_analysis() {
        var factory = require(__dirname + '/elf_analysis.js');
        var instance = await factory();
        
        var res = {
            instance: instance,
            analyse_data: instance.cwrap('elf_analysis_analyse_data', 'number', ['number', 'number']),
            get_filename: instance.cwrap('elf_analysis_get_filename', 'string'),
            get_lines_size: instance.cwrap('elf_analysis_get_lines_size', 'number'),
    
            get_address: instance.cwrap('elf_analysis_get_address', 'number', ['number']),
            get_opcode_description: instance.cwrap('elf_analysis_get_opcode_description', 'string', ['number']),
            get_branch_destination: instance.cwrap('elf_analysis_get_branch_destination', 'number', ['number']),
    
            get_line_filename: instance.cwrap('elf_analysis_get_line_filename', 'string', ['number']),
            get_line_path: instance.cwrap('elf_analysis_get_line_path', 'string', ['number']),
            get_line_line: instance.cwrap('elf_analysis_get_line_line', 'number', ['number']),
            get_line_column: instance.cwrap('elf_analysis_get_line_column', 'number', ['number']),
            get_line_isStartSequence: instance.cwrap('elf_analysis_get_line_isStartSequence', 'number', ['number']),
    
            get_branch_destination_line_filename: instance.cwrap('elf_analysis_get_branch_destination_line_filename', 'string', ['number']),
            get_branch_destination_line_path: instance.cwrap('elf_analysis_get_branch_destination_line_path', 'string', ['number']),
            get_branch_destination_line_line: instance.cwrap('elf_analysis_get_branch_destination_line_line', 'number', ['number']),
            get_branch_destination_line_column: instance.cwrap('elf_analysis_get_branch_destination_line_column', 'number', ['number']),
            get_branch_destination_line_isStartSequence: instance.cwrap('elf_analysis_get_branch_destination_line_isStartSequence', 'number', ['number'])
        }   

        return res;
    }

    /** 
     * @brief    Disassembles the content of a file
     * @author   GrandChris
     * @date     2021-03-18
     */
    private async parseElfFile(data: Uint8Array) {
        if(this.elf_analysis == null) {
            this.elf_analysis = await this.create_elf_analysis();
        }
        const elf_analysis = this.elf_analysis;

        // Allocate some space in the heap for the data (making sure to use the appropriate memory size of the elements)
        var buffer = elf_analysis.instance._malloc(data.length)
        // Assign the data to the heap - Keep in mind bytes per element
       elf_analysis.instance.HEAPU8.set(data, buffer);

        var res = elf_analysis.analyse_data(buffer, data.length);

        console.log("Number of Lines: ", elf_analysis.get_lines_size());

        var disassembledFile : DisassembledFile = {
            filename : "",
            lines: []
        };

        var size = elf_analysis.get_lines_size();
        var lines_size = 0;
        for (var i = 0; i < size; i++) {
            
            const line : Line = {
                filename : elf_analysis.get_line_filename(i),
                path: elf_analysis.get_line_path(i).replace(/\\/g, '/'),
                line: elf_analysis.get_line_line(i),
                column: elf_analysis.get_line_column(i),
                isStartSequence : Boolean(elf_analysis.get_line_isStartSequence(i))
            }

            const line_Branch : Line = {
                filename : elf_analysis.get_branch_destination_line_filename(i),
                path: elf_analysis.get_branch_destination_line_path(i),
                line: elf_analysis.get_branch_destination_line_line(i),
                column: elf_analysis.get_branch_destination_line_column(i),
                isStartSequence : Boolean(elf_analysis.get_branch_destination_line_isStartSequence(i))
            }

            const disassembledLine : DisassembledLine = {
                address : elf_analysis.get_address(i),
                opcode_description: elf_analysis.get_opcode_description(i),
                branch_destination: elf_analysis.get_branch_destination(i),
                branch_destination_line : line_Branch,
                line : line,
                index : 0
            }

            if(disassembledLine.line.isStartSequence) {
                const line_empty : Line = {
                    filename : "",
                    path: "",
                    line: 0,
                    column: 0,
                    isStartSequence : false
                }
                const emptyLine : DisassembledLine  = {
                    address : 0,
                    opcode_description: "",
                    branch_destination: 0,
                    branch_destination_line : line_empty,
                    line : line_empty,
                    index : disassembledFile.lines.length
                }
                disassembledFile.lines.push(emptyLine);
            }

            disassembledLine.index = disassembledFile.lines.length;
            disassembledFile.lines.push(disassembledLine);
        }

        return disassembledFile;
    }

    /** 
     * @brief    Converts the disassembled content to a string
     * @author   GrandChris
     * @date     2021-03-18
     */
    private async toString(disassembledFile : DisassembledFile) {
        var content = "";
      
      const size = disassembledFile.lines.length;
      for (var i = 0; i < size; i++) {
        var line = ""
        if(disassembledFile.lines[i].address == 0) {
            // line += DisassembledFile.lines[i].index.toString();
        }
        else {
            line += ("0x" + disassembledFile.lines[i].address.toString(16) + " " + disassembledFile.lines[i].opcode_description + " ").padEnd(35, ' ');
            if(disassembledFile.lines[i].line.filename != "") {
                line += (disassembledFile.lines[i].line.filename + ":" + disassembledFile.lines[i].line.line + ":" + disassembledFile.lines[i].line.column + " ").padEnd(30, ' ');
                // line += (disassembledFile.lines[i].line.path + "/" + disassembledFile.lines[i].line.filename + ":" + disassembledFile.lines[i].line.line + ":" + disassembledFile.lines[i].line.column + " ").padEnd(40, ' ');
            }
            if(disassembledFile.lines[i].branch_destination_line.filename.length != 0) {
                line += "0x" + disassembledFile.lines[i].branch_destination.toString(16) + " ";
                line += disassembledFile.lines[i].branch_destination_line.filename + ":" + disassembledFile.lines[i].branch_destination_line.line + ":" + disassembledFile.lines[i].branch_destination_line.column;
            }
        }

        line += "\n";
        content += line;
      } 

      return content;
    }
};



/** 
 * @brief    Instantiates the worker class and connects the Message ports
 * @author   GrandChris
 * @date     2021-03-18
 */

var elfLensWorker = new ElfLensWorker();

if(parentPort != null) {
    parentPort.on("message", (params) => {
        console.log("message channels received");
        console.log(params);

        const asmInputPort:  MessagePort = params.asmInputPort;
        const asmResultPort: MessagePort = params.asmResultPort;
        const lineInputPort: MessagePort = params.lineInputPort;
        const lineResultPort:MessagePort = params.lineResultPort;

        asmInputPort.on("message", async (params: any) => {
            console.log("buffer content arrived");
            console.log("asmInputPort.on" + params);
            const data = await elfLensWorker.disassemble(params);

            asmResultPort.postMessage(data, [ data.content.buffer ]);
        });

        lineInputPort.on("message", async (params: any) => {
            console.log("asking for the line number");
            console.log("lineInputPort.on " + params);

            const lineNumber = elfLensWorker.getLineNumber(params);

            lineResultPort.postMessage(lineNumber);
        });

    });
}



