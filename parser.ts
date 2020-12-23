import TypeStatus  from './libs/typeStatus';
import Lexem       from './libs/lexem';
import Parser      from './libs/ParseModel';
import * as fs     from 'fs';
import * as combin from './combin';
import { spawn } from 'child_process';

let
    result  : string,
    fileData: string = fs.readFileSync('data.txt', 'utf-8');

//подумать про ошибки в каждом из парсеров!!!!!!!!!!!!!!!!!!
//seq удалить проверку на длину массива

let 
    varParser = combin.functor(combin.genTerm(/^var\s+/ig), (res_: combin.parserRes): combin.parserRes => {
        return {
            result: 'Var',
            input : res_.input,
        };
    }),

    equalParser = combin.functor(combin.genTerm(/^:=/ig), (res_: combin.parserRes): combin.parserRes => {
        return {
            result: '=',
            input : res_.input,
        };
    }),

    unaryParser = combin.functor(combin.genTerm(/^!/ig), (res_: combin.parserRes) => {
        return {
            result: '.NOT.',
            input : res_.input,
        };
    }),

    binaryParser = combin.functor(combin.genTerm(/^[\|\^\&]/ig), (res_: combin.parserRes) => {
        
        let result: string = '';

        switch(res_.result){
            case '|':
                result = '.OR.';
                break;
            case '^':
                result = '.XOR.';
                break;
            case '&':
                result = '.AND.';
                break;
        }
        
        return {
            result: result,
            input : res_.input,
        };
    }),

    //накинуть сверху вывод ошибки
    identParser = combin.functor(
        combin.genTerm(/^\b((?!begin|var|end)([a-z]+))\b/ig),
        (res_: string) => {
            console.log('ident:', res_);
            return res_;
        }
    ),

    commaParser = combin.genTerm(/^,/ig),

    colonParser = combin.genTerm(/^:/ig),

    semicolonParser = combin.genTerm(/^;/ig),
    
    constParser = combin.genTerm(/^[10]/ig),

    beginParser = combin.functor(combin.genTerm(/^begin/ig), (res_: combin.parserRes) => {
        return {
            result: 'Begin',
            input : res_.input,
        };
    }),

    endParser = combin.functor(combin.genTerm(/^end/ig),  (res_: combin.parserRes) => {
        return {
            result: 'End',
            input : res_.input,
        };
    }),

    logicalParser = combin.functor(
        combin.seqApp(
            combin.genTerm(/^logical/ig),
            semicolonParser,
        ),
        (res_: combin.parserRes): combin.parserRes | null => {
            if(res_.result.length != 2) return null; //normal error here
            return {
                result: `Boolean;`,
                input : res_.input,
            };
        },
    ),
   
    identListParser = new Parser((str_: string): combin.parserRes => {
        let
            identColonParser: Parser = combin.functor(
                combin.seqApp(identParser, colonParser),
                (res_: combin.parserRes): combin.parserRes | null => {
                    if(res_.result.length != 2) return null; //i need in normal error here
                    return {
                        result: `${res_.result[0]}${res_.result[1]}`,
                        input : res_.input,
                    };
                },
            ),
            
            identCommaParser: Parser = combin.functor(
                combin.seqApp(identParser, commaParser),
                (res_: combin.parserRes) => {
                    if(res_.result.length != 2) return null; //i need in normal error here
                    return {
                        result: `${res_.result[0]}${res_.result[1]}`,
                        input : res_.input,
                    }
                },
            ),

            listIdentCommaParser: Parser = combin.functor(
                combin.oneOrMany(identCommaParser),
                (res_: combin.parserRes) => {

                    //проверка на null
                    let valueLanguage: string = '';

                    for(let i = 0; i < res_.result.length; i++){
                        valueLanguage += res_.result[i] + ' ';
                    }

                    return {
                        result: valueLanguage,
                        input : res_.input,
                    }
                }
            ),
    
            listIdentCommaColonParser: Parser = combin.functor(
                combin.seqApp(listIdentCommaParser, identColonParser),
                (res_: combin.parserRes) => {
                    if(res_.result.length != 2) return null; //i need in normal error here
                    return {
                        result: `${res_.result[0]}${res_.result[1]}`,
                        input : res_.input,
                    }
                },
            ),

            resultParser: Parser = combin.seqAlt(
                identColonParser, 
                listIdentCommaColonParser,
            );

        return resultParser.parse(str_);
    }),


    varDecParser = new Parser((str_: string): combin.parserRes => {
        
        let 
            parser1 = combin.functor(
                combin.seqApp(varParser, identListParser),
                (res_: combin.parserRes) => {
                    if(res_.result.length != 2) return null; //i need in normal error here
                    return {
                        result: `${res_.result[0]} ${res_.result[1]}`,
                        input : res_.input,
                    }                    
                },
            ),
            resultParser = combin.functor(
                combin.seqApp(parser1, logicalParser),
                (res_: combin.parserRes) => {
                    if(res_.result.length != 2) return null; //i need in normal error here
                    return {
                        result: `${res_.result[0]} ${res_.result[1]}`,
                        input : res_.input,
                    } 
                },
            );
        
        return resultParser.parse(str_);
    }),

    operandParser = new Parser((str_: string): combin.parserRes => {
        return combin.seqAlt(identParser, constParser).parse(str_);
    }),

    unaryOperandParser = new Parser((str_: string): combin.parserRes => {

        console.log(str_);

        let
            unrOperParser = combin.functor(
                combin.seqApp(
                    unaryParser,
                    operandParser,
                ), 
                (res_: combin.parserRes) => {
                    return {
                        result: `${res_.result[0]} ${res_.result[1]}`,
                        input : res_.input,
                    }
                }
            ),
            resultParser = combin.seqAlt(
                unrOperParser,
                operandParser,
            );

        return resultParser.parse(str_);
    }),

    
    expressionParser = new Parser((str_: string): combin.parserRes => {
 
        let
            exprParser = combin.functor(
                combin.seqAppL(
                    combin.functor(
                        combin.seqAppR(
                            combin.genTerm(/^\(/ig),
                            expressionParser,
                        ),
                        (res_: combin.parserRes): combin.parserRes => {
                            return {
                                result: `(${res_.result}`,
                                input : res_.input,
                            }
                        }
                    ), 
                    combin.genTerm(/^\)/ig)
                ),
                (res_: combin.parserRes): combin.parserRes => {
                    return {
                        result: `${res_.result})`,
                        input : res_.input,
                    }
                } 
            ),

            undExprParser = combin.functor(
                combin.seqApp(
                    combin.functor(
                        combin.seqApp(
                            combin.seqAlt(
                                exprParser,
                                unaryOperandParser 
                            ),
                            binaryParser
                        ),
                        (res_: combin.parserRes): combin.parserRes => {
                            return {
                                result: `${res_.result[0]} ${res_.result[1]}`,
                                input : res_.input,
                            }
                        }
                    ),
                    combin.seqAlt(
                        combin.seqAlt(
                            exprParser,
                            expressionParser
                        ),
                        unaryOperandParser
                    )
                ),
                (res_: combin.parserRes): combin.parserRes => {
                    return {
                        result: `${res_.result[0]} ${res_.result[1]}`,
                        input : res_.input,
                    }
                } 
            );
            
        return combin.seqAlt(
            combin.seqAlt(
                undExprParser,
                exprParser,
            ),
            unaryOperandParser,
        ).parse(str_);
        
    }),

    
    assignmentParser = new Parser((str_: string) => {

        let parserResult = combin.functor(
            combin.seqApp(
                combin.functor(
                    combin.seqApp(
                        combin.functor(
                            combin.seqApp(identParser, equalParser),
                            (res_: combin.parserRes): combin.parserRes => {
                                return {
                                    result: `${res_.result[0]} ${res_.result[1]}`,
                                    input : res_.input,
                                }
                            } 
                        ),
                        expressionParser
                    ),
                    (res_: combin.parserRes): combin.parserRes => {
                        return {
                            result: `${res_.result[0]} ${res_.result[1]}`,
                            input : res_.input,
                        }
                    } 
                ),
                semicolonParser
            ),
            (res_: combin.parserRes): combin.parserRes => {
                return {
                    result: `${res_.result[0]}${res_.result[1]}`,
                    input : res_.input,
                }
            }
        );

        return parserResult.parse(str_);
    }),

    assignmentListParser = new Parser((str_: string) => {

        let listParser: Parser = combin.functor(
            combin.oneOrMany(assignmentParser),
            (res_: combin.parserRes) => {

                //проверка на null
                let valueLanguage: string = '';

                for(let i = 0; i < res_.result.length; i++){
                    valueLanguage += res_.result[i] + '\n';
                }

                return {
                    result: valueLanguage,
                    input : res_.input,
                }
            }
        );

        console.log(listParser.parse(str_));

        return listParser.parse(str_);

    });


export {
    varParser,
    logicalParser,
    identListParser,

    beginParser,
    endParser,
    
    equalParser,

    unaryParser,
    binaryParser,

    identParser,
    operandParser,

    varDecParser,
    expressionParser,
    assignmentParser,
    assignmentListParser,
};


// console.log(stringToTerminal(/(var)/ig,                           TypeStatus.keyword).parse(fileData));
// console.log(stringToTerminal(/([\(\),;]|begin|end)/ig,            TypeStatus.separator).parse(fileData));
// console.log(stringToTerminal(/[01]/ig,                            TypeStatus.const).parse(fileData));
// console.log(stringToTerminal(/[\|\^\&!]/ig,                       TypeStatus.operator).parse(fileData));
// console.log(stringToTerminal(/\b((?!begin|var|end)([a-z]+))\b/ig, TypeStatus.identifier).parse(fileData));


