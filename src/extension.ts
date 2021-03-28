// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CodelensProvider } from './codlens_provider';
import { Disassembler } from './disassembler';
import { MessageChannel, receiveMessageOnPort, Worker } from 'worker_threads';
import { strict } from 'node:assert';
import { Stopwatch } from 'ts-stopwatch';


let disposables: vscode.Disposable[] = [];

var static_out : vscode.OutputChannel | null = null;
var static_disassembler : Disassembler | null = null;
var isDisassembled: boolean = false;


/** 
 * @brief   Instantiates the output channel
 * @author  GrandChris
 * @date    2021-03-18
 */
function getOutputChannel() {
	if(static_out == null) {
		static_out = vscode.window.createOutputChannel("Elf Lens");
	}

	var res : vscode.OutputChannel = static_out;
	return res;
}

/** 
 * @brief   Instantiates the Disassembler
 * @author  GrandChris
 * @date    2021-03-18
 */
function getDisassembler() {
	if(static_disassembler == null) {
		static_disassembler = new Disassembler(getOutputChannel())
	}
	var res : Disassembler = static_disassembler;

	return res;
}


/** 
 * @brief   Returns the current selected line of the editor
 * @author  GrandChris
 * @date    2021-03-18
 */
function getLine() {
	var res = {
		currentFile : "",
		currentLine : 0,
		currentColumn : 0
	}

	const activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		res.currentFile = activeEditor.document.fileName;
		res.currentLine = activeEditor.selection.active.line;
		res.currentColumn = activeEditor.selection.active.character;
	}

	return res;
}

/** 
 * @brief   Returns the absolute path of the file specified in the settings
 * @author  GrandChris
 * @date    2021-03-18
 */
function getFileName() {
	var out = getOutputChannel();
	const fileName = vscode.workspace.getConfiguration("elf-lens").get("filePath");
	if(!fileName) {
		out.appendLine('Error: Setting elf-lens.filePath not found!');
		return "";
	}
	
	if(!vscode.workspace.workspaceFolders) {
		out.appendLine('elf-lens: Error, not inside a workspace folder!');
		return "";
	}
	const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath; // gets the path of the first workspace folder
	const absPath = wsPath + "/" + fileName;

	return absPath;
}

/** 
 * @brief   Disassembles the .elf file
 * @author  GrandChris
 * @date    2021-03-18
 */
async function Disassemble(){
	var out = getOutputChannel();

	const overallStopwatch = new Stopwatch();
	overallStopwatch.start();

	const outputDetails = vscode.workspace.getConfiguration("elf-lens").get("outputDetails");
	const showOutputWindow = vscode.workspace.getConfiguration("elf-lens").get("showOutputWindow");
	if(showOutputWindow) {
		out.show();
	}
	out.appendLine("Executing 'showDisassembly'");

	// ########## get filename ##########
	const absPath = getFileName();
	if(absPath == "") {
		return;
	}
	
	try {
		var disassembler = getDisassembler();
		await disassembler.disassemble(absPath, getLine());	
		isDisassembled = true;		
	}
	catch (err){
		out.appendLine(err);
		vscode.window.showInformationMessage('elf-lens: ' + err);
		return;
	}

	overallStopwatch.stop();
	out.appendLine("-----------------------------------------");
	out.appendLine("Overall time elapsed: " + overallStopwatch.getTime().toString() + " ms");
}

/** 
 * @brief   Shows the line inside the .asm file
 * @author  GrandChris
 * @date    2021-03-18
 */
async function ShowLine() {
	var out = getOutputChannel();

	try {
		if(!isDisassembled) {
			Disassemble();
		}
		else {
			var disassembler = getDisassembler();
			await disassembler.showLine(getLine());	
		}
	}
	catch (err){
		out.appendLine(err);
		vscode.window.showInformationMessage('elf-lens: ' + err);
		return;
	}
}


/**
 * @brief This method is called when your extension is activated
 * @param {vscode.ExtensionContext} context the context
 */
export function activate(context: vscode.ExtensionContext) {
	// console.log('Congratulations, your extension "elf-code-lens" is now active!');

	

	// }
	let disposable0 = vscode.commands.registerCommand('elf-lens.Disassemble', () => {
		Disassemble();
	});
	disposables.push(disposable0);

	let disposable1 = vscode.commands.registerCommand('elf-lens.ShowLine', () => {
		ShowLine();
	});
	disposables.push(disposable1);


	// const codelensProvider = new CodelensProvider();

	// vscode.languages.registerCodeLensProvider("*", codelensProvider);

	vscode.commands.registerCommand("codelens-sample.enableCodeLens", () => {
        vscode.workspace.getConfiguration("codelens-sample").update("enableCodeLens", true, true);
    });

	vscode.commands.registerCommand("codelens-sample.disableCodeLens", () => {
        vscode.workspace.getConfiguration("codelens-sample").update("enableCodeLens", false, true);
    });

	
    vscode.commands.registerCommand("codelens-sample.codelensAction", (args: any) => {
        vscode.window.showInformationMessage(`CodeLens action clicked with args=${args}`);
    });


	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('elf-code-lens.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from elf_code_lens!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}
